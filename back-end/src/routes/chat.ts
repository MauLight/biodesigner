import { Router } from "express";
import type { Request, Response, NextFunction } from "express";

import { config } from "../config.js";
import { generateReply, streamReply } from "../openai.js";
import type { ChatMessage } from "../openai.js";
import { parseAssessment } from "../criteria.js";
import type { StepAssessment } from "../criteria.js";
import { SENTINELS, STEP_READY_SENTINEL } from "../prompt.js";
import { DESIGN_STEPS, isDesignStep } from "../steps.js";
import type { DesignStep } from "../steps.js";

const MAX_CONTENT_LENGTH = 32_000;

class BadRequestError extends Error {}

interface ChatRequest {
  messages: ChatMessage[];
  stream: boolean;
  currentStep: DesignStep;
  forcedAdvance: boolean;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ChatMessage>;

  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string"
  );
}

function parseMessages(body: {
  prompt?: unknown;
  messages?: unknown;
}): ChatMessage[] {
  const { prompt, messages } = body;

  if (typeof prompt === "string") {
    if (prompt.trim() === "") {
      throw new BadRequestError("`prompt` must not be empty.");
    }

    return [{ role: "user", content: prompt }];
  }

  if (!Array.isArray(messages)) {
    throw new BadRequestError(
      "Provide either `prompt` (a string) or `messages` (an array of { role, content }).",
    );
  }

  if (messages.length === 0) {
    throw new BadRequestError("`messages` must not be empty.");
  }

  if (!messages.every(isChatMessage)) {
    throw new BadRequestError(
      "Each message must be { role: 'user' | 'assistant', content: string }.",
    );
  }

  const oversized = messages.find(
    (message) => message.content.length > MAX_CONTENT_LENGTH,
  );

  if (oversized !== undefined) {
    throw new BadRequestError(
      `Message content must be at most ${MAX_CONTENT_LENGTH} characters.`,
    );
  }

  return messages;
}

/**
 * Accepts either a full conversation (`messages`) or a single turn (`prompt`).
 * BIDARA's process is a back-and-forth, so the client is expected to send the
 * whole history back on each request — the server keeps no state.
 *
 * `currentStep` is owned by the client, not inferred here. `forcedAdvance` says
 * the user moved on before BIDARA was satisfied. Streams by default; pass
 * `stream: false` for a single JSON response.
 */
function parseRequest(body: unknown): ChatRequest {
  if (typeof body !== "object" || body === null) {
    throw new BadRequestError("Request body must be a JSON object.");
  }

  const { stream, currentStep, forcedAdvance } = body as {
    stream?: unknown;
    currentStep?: unknown;
    forcedAdvance?: unknown;
  };

  if (stream !== undefined && typeof stream !== "boolean") {
    throw new BadRequestError("`stream` must be a boolean.");
  }

  if (forcedAdvance !== undefined && typeof forcedAdvance !== "boolean") {
    throw new BadRequestError("`forcedAdvance` must be a boolean.");
  }

  // Every conversation opens on Define, so an absent step just means turn one.
  if (currentStep !== undefined && !isDesignStep(currentStep)) {
    throw new BadRequestError(
      `\`currentStep\` must be one of ${DESIGN_STEPS.join(", ")}.`,
    );
  }

  return {
    messages: parseMessages(body),
    stream: stream ?? true,
    currentStep: currentStep ?? "Define",
    forcedAdvance: forcedAdvance ?? false,
  };
}

function openEventStream(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Tells nginx and friends not to buffer the response.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

function sendEvent(res: Response, event: string | null, data: unknown): void {
  if (event !== null) {
    res.write(`event: ${event}\n`);
  }

  // JSON escapes newlines, so the payload is always a single `data:` line.
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

/** Where a token was found, and which one. */
interface Hit {
  at: number;
  token: string;
}

function firstSentinel(text: string): Hit | null {
  let best: Hit | null = null;

  for (const token of SENTINELS) {
    const at = text.indexOf(token);

    if (at !== -1 && (best === null || at < best.at)) {
      best = { at, token };
    }
  }

  return best;
}

/**
 * Splits the stream at BIDARA's sentinel: prose before it reaches the client,
 * everything after it is the report and never does.
 *
 * A token can straddle two chunks, so the last `HOLDBACK` characters are held
 * until more text arrives or the stream ends — otherwise half a token would be
 * emitted before the other half revealed what it was.
 *
 * Everything past the token is swallowed rather than stripped in place. The
 * prompt says write nothing else after it, and a model that ignores that should
 * not be able to leak JSON into the transcript.
 */
class SentinelFilter {
  private pending = "";
  private payload = "";
  private hit: Hit | null = null;

  private static readonly HOLDBACK =
    Math.max(...SENTINELS.map((token) => token.length)) - 1;

  /** Returns text safe to emit now — possibly empty. */
  push(delta: string): string {
    if (this.hit !== null) {
      this.payload += delta;
      return "";
    }

    this.pending += delta;

    const found = firstSentinel(this.pending);

    if (found !== null) {
      this.hit = found;
      this.payload = this.pending.slice(found.at + found.token.length);

      const emit = this.pending.slice(0, found.at);
      this.pending = "";

      return emit;
    }

    if (this.pending.length <= SentinelFilter.HOLDBACK) {
      return "";
    }

    const emit = this.pending.slice(
      0,
      this.pending.length - SentinelFilter.HOLDBACK,
    );

    this.pending = this.pending.slice(emit.length);

    return emit;
  }

  /**
   * Returns whatever is left once the stream is done — including the tail after
   * the token, if that tail turned out to be prose rather than a report.
   *
   * The prompt says the token comes last, so everything after it is withheld
   * while streaming. But if the model puts the token mid-reply, that rule would
   * silently eat the rest of the answer — including the closing question the user
   * was supposed to respond to. By flush time the whole tail is in hand, so a
   * tail with no object in it can be recognised as prose and released.
   *
   * The `{` test, rather than trying to parse: a *malformed* report must stay
   * hidden, or a botched payload leaks into the transcript. Only a tail that
   * never looked like a report at all is let through.
   */
  flush(): string {
    const remaining = this.pending;
    this.pending = "";

    if (this.payload !== "" && !this.payload.includes("{")) {
      const prose = this.payload;
      this.payload = "";

      return remaining + prose;
    }

    return remaining;
  }

  /** Only the ready token means the current step is satisfied. */
  get stepComplete(): boolean {
    return this.hit?.token === STEP_READY_SENTINEL;
  }

  get assessment(): StepAssessment | null {
    return this.hit === null ? null : parseAssessment(this.payload);
  }
}

async function respondWithStream(
  res: Response,
  next: NextFunction,
  { messages, currentStep, forcedAdvance }: ChatRequest,
): Promise<void> {
  const controller = new AbortController();

  // Must listen on `res`, not `req`: `req` emits "close" as soon as the body
  // parser drains it, which would abort the upstream call immediately. `res`
  // emits "close" when the connection actually goes away.
  res.on("close", function onClientDisconnect(): void {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  const filter = new SentinelFilter();
  let open = false;

  function ensureOpen(): void {
    if (!open) {
      openEventStream(res);
      open = true;
    }
  }

  try {
    for await (const delta of streamReply(
      messages,
      currentStep,
      forcedAdvance,
      controller.signal,
    )) {
      const text = filter.push(delta);

      if (text !== "") {
        ensureOpen();
        sendEvent(res, null, { delta: text });
      }
    }

    const tail = filter.flush();

    ensureOpen();

    if (tail !== "") {
      sendEvent(res, null, { delta: tail });
    }

    sendEvent(res, "done", {
      model: config.openaiModel,
      step: currentStep,
      stepComplete: filter.stepComplete,
      assessment: filter.assessment,
    });

    res.end();
  } catch (error) {
    if (controller.signal.aborted) {
      res.end();
      return;
    }

    // Nothing has been written yet, so the normal error middleware can still
    // set a real status code.
    if (!open) {
      next(error);
      return;
    }

    console.error("Streaming error:", error);
    sendEvent(res, "error", { error: describe(error) });
    res.end();
  }
}

async function respondWithJson(
  res: Response,
  next: NextFunction,
  { messages, currentStep, forcedAdvance }: ChatRequest,
): Promise<void> {
  try {
    const raw = await generateReply(messages, currentStep, forcedAdvance);

    // Same split as the streaming path: prose before the token, report after —
    // and the same recovery, so a token placed mid-reply doesn't take the rest
    // of the answer with it.
    const found = firstSentinel(raw);

    let reply = raw;
    let assessment: StepAssessment | null = null;

    if (found !== null) {
      const tail = raw.slice(found.at + found.token.length);

      reply = raw.slice(0, found.at) + (tail.includes("{") ? "" : tail);
      assessment = parseAssessment(tail);
    }

    reply = reply.trim();

    res.json({
      reply,
      model: config.openaiModel,
      step: currentStep,
      stepComplete: found?.token === STEP_READY_SENTINEL,
      assessment,
    });
  } catch (error) {
    next(error);
  }
}

async function handleChat(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let parsed: ChatRequest;

  try {
    parsed = parseRequest(req.body);
  } catch (error) {
    if (error instanceof BadRequestError) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
    return;
  }

  if (parsed.stream) {
    await respondWithStream(res, next, parsed);
    return;
  }

  await respondWithJson(res, next, parsed);
}

export const chatRouter: Router = Router();

chatRouter.post("/chat", handleChat);
