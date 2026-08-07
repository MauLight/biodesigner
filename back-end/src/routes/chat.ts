import { Router } from "express";
import type { Request, Response, NextFunction } from "express";

import { completeChat, parseChatRequest, runChat } from "../core/chat.js";
import type { ChatInput } from "../core/chat.js";
import { BadRequestError } from "../core/errors.js";

/**
 * The HTTP adapter over `core/chat`.
 *
 * Everything about the conversation — parsing, the sentinel split, what the
 * outcome contains — lives in the core so the Electron shell can run the same
 * code over IPC. This file is transport and nothing else: SSE framing, status
 * codes, and knowing when it is too late to send one.
 */

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

async function respondWithStream(
  res: Response,
  next: NextFunction,
  input: ChatInput,
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

  let open = false;

  /**
   * Deltas go out with no event name, which is the wire format the client's SSE
   * parser was written against. The core names them because IPC frames have no
   * other way to say what they are.
   */
  function emit(event: "delta" | "done", data: Record<string, unknown>): void {
    if (!open) {
      openEventStream(res);
      open = true;
    }

    sendEvent(res, event === "delta" ? null : event, data);
  }

  try {
    await runChat(input, emit, controller.signal);
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
  input: ChatInput,
): Promise<void> {
  try {
    res.json(await completeChat(input));
  } catch (error) {
    next(error);
  }
}

async function handleChat(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let input: ChatInput;

  try {
    input = parseChatRequest(req.body);
  } catch (error) {
    if (error instanceof BadRequestError) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
    return;
  }

  if (input.stream) {
    await respondWithStream(res, next, input);
    return;
  }

  await respondWithJson(res, next, input);
}

export const chatRouter: Router = Router();

chatRouter.post("/chat", handleChat);
