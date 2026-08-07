import { config } from "../config.js";
import { generateReply, streamReply } from "../openai.js";
import type { ChatMessage } from "../openai.js";
import { parseAssessment } from "../criteria.js";
import type { StepAssessment } from "../criteria.js";
import {
  SENTINELS,
  STEP_READY_SENTINEL,
  STEP_REPORT_SENTINEL,
} from "../prompt.js";
import { FINISH_STEP, DESIGN_STEPS, isSessionStep } from "../steps.js";
import type { SessionStep } from "../steps.js";
import { BadRequestError } from "./errors.js";

/**
 * A BIDARA turn, with no idea how it will be delivered.
 *
 * This is the whole of the conversation logic — parsing, the sentinel split, and
 * the shape of what comes back. It exists apart from Express because the Electron
 * shell runs it in the main process over IPC, and the alternative was two copies
 * of `SentinelFilter`. That class is the most delicate code in the project: it
 * decides what reaches the transcript and what is BIDARA talking to the app.
 * Two of it would drift, and the drift would be silent.
 */

const MAX_CONTENT_LENGTH = 32_000;

export interface ChatInput {
  messages: ChatMessage[];
  stream: boolean;
  currentStep: SessionStep;
  forcedAdvance: boolean;
}

/** What the caller learns once the reply is finished. */
export interface ChatOutcome {
  model: string;
  step: SessionStep;
  stepComplete: boolean;
  reportsPrevious: boolean;
  assessment: StepAssessment | null;
}

/**
 * One frame out.
 *
 * `delta` carries prose as it arrives; `done` carries the outcome and comes last.
 * Failures are thrown rather than emitted, so an adapter that has not written
 * anything yet can still fail properly — an HTTP status rather than an error
 * event inside a 200.
 */
export type Emit = (event: "delta" | "done", data: Record<string, unknown>) => void;

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
 * whole history back each time — nothing here keeps state.
 *
 * `currentStep` is owned by the client, not inferred. `forcedAdvance` says the
 * user moved on before BIDARA was satisfied.
 */
export function parseChatRequest(body: unknown): ChatInput {
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
  // `Finish` is accepted too: the closing request is sent from it.
  if (currentStep !== undefined && !isSessionStep(currentStep)) {
    throw new BadRequestError(
      `\`currentStep\` must be one of ${[...DESIGN_STEPS, FINISH_STEP].join(", ")}.`,
    );
  }

  return {
    messages: parseMessages(body),
    stream: stream ?? true,
    currentStep: currentStep ?? "Define",
    forcedAdvance: forcedAdvance ?? false,
  };
}

/** Where a token was found, and which one. */
interface Hit {
  at: number;
  token: string;
}

export function firstSentinel(text: string): Hit | null {
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

  /**
   * The report describes the step the user just left, not the one in progress.
   *
   * Which token was used *is* the attribution, and it is the only account of it
   * that comes from the model. The client used to infer this from whether it had
   * forced the advance, which is a different question: BIDARA can be told the user
   * moved on early and still answer with `STEP_READY` about the step it is now on.
   * When that happened, the report was filed one step back and the step it was
   * actually about kept nothing.
   */
  get reportsPrevious(): boolean {
    return this.hit?.token === STEP_REPORT_SENTINEL;
  }

  get assessment(): StepAssessment | null {
    return this.hit === null ? null : parseAssessment(this.payload);
  }
}

/**
 * Streams one turn, emitting prose as it arrives and an outcome at the end.
 *
 * Throws rather than emitting a failure. Adapters need that distinction: nothing
 * has been written when it throws, so an HTTP adapter can still send a real status
 * code instead of an error buried inside a 200 it already committed to.
 */
export async function runChat(
  input: ChatInput,
  emit: Emit,
  signal: AbortSignal,
): Promise<void> {
  const filter = new SentinelFilter();

  for await (const delta of streamReply(
    input.messages,
    input.currentStep,
    input.forcedAdvance,
    signal,
  )) {
    const text = filter.push(delta);

    if (text !== "") {
      emit("delta", { delta: text });
    }
  }

  const tail = filter.flush();

  if (tail !== "") {
    emit("delta", { delta: tail });
  }

  const outcome: ChatOutcome = {
    model: config().openaiModel,
    step: input.currentStep,
    stepComplete: filter.stepComplete,
    reportsPrevious: filter.reportsPrevious,
    assessment: filter.assessment,
  };

  emit("done", { ...outcome });
}

/**
 * The same turn in one piece, for `stream: false`. Mostly useful for curl and
 * tests, and it applies the same split — a token placed mid-reply must not take
 * the rest of the answer with it here either.
 */
export async function completeChat(
  input: ChatInput,
): Promise<ChatOutcome & { reply: string }> {
  const raw = await generateReply(
    input.messages,
    input.currentStep,
    input.forcedAdvance,
  );

  const found = firstSentinel(raw);

  let reply = raw;
  let assessment: StepAssessment | null = null;

  if (found !== null) {
    const tail = raw.slice(found.at + found.token.length);

    reply = raw.slice(0, found.at) + (tail.includes("{") ? "" : tail);
    assessment = parseAssessment(tail);
  }

  return {
    reply: reply.trim(),
    model: config().openaiModel,
    step: input.currentStep,
    stepComplete: found?.token === STEP_READY_SENTINEL,
    reportsPrevious: found?.token === STEP_REPORT_SENTINEL,
    assessment,
  };
}
