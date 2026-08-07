import type { IpcMainInvokeEvent, WebContents } from "electron";

import { parseChatRequest, runChat } from "back-end/core/chat";
import { parseSummarizeRequest, runSummarize } from "back-end/core/summarize";
import {
  parseCheatsheetRequest,
  runCheatsheet,
} from "back-end/core/cheatsheet";
import { listAll, read, remove, write } from "back-end/core/sessions";
import { config, hasApiKey } from "back-end/config";

/**
 * Runs the back-end's core in the main process and pushes its frames to the
 * renderer.
 *
 * The core is transport-agnostic — parse, then run with an `emit` — so this is
 * the IPC counterpart to the Express adapters in back-end/src/routes. Frames keep
 * the same (event, data) shape SSE produced, which is why the renderer's parsing
 * needed no second implementation.
 *
 * The API key never crosses the bridge: it is read from safeStorage in main and
 * handed to the back-end's config, so the renderer has no way to ask for it.
 */

/**
 * Outcomes are returned, not thrown.
 *
 * An `ipcMain.handle` rejection reaches the renderer wrapped in "Error invoking
 * remote method ...", which buries the real message — and these messages matter:
 * they are the validation errors the HTTP path returns as a 400 body. Preload
 * unwraps this and rethrows cleanly.
 */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export type StreamResult =
  | { status: "done" }
  | { status: "aborted" }
  | { status: "error"; message: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

async function attempt<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

/** In-flight turns, so a cancel can find the right one. */
const running = new Map<string, AbortController>();

interface StreamRequest {
  body: unknown;
  requestId: string;
}

function isStreamRequest(value: unknown): value is StreamRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { requestId } = value as Record<string, unknown>;

  return typeof requestId === "string" && requestId.length > 0;
}

/**
 * Sends one frame, tagged with the turn it belongs to.
 *
 * Guards against a destroyed window: a turn outliving its window would otherwise
 * throw on every token.
 */
function frameSender(sender: WebContents, requestId: string) {
  return (event: "delta" | "done", data: Record<string, unknown>): void => {
    if (sender.isDestroyed()) {
      return;
    }

    sender.send("chat:frame", { requestId, event, data });
  };
}

export async function startChat(
  event: IpcMainInvokeEvent,
  request: unknown,
): Promise<StreamResult> {
  if (!isStreamRequest(request)) {
    return { status: "error", message: "Malformed chat request." };
  }

  const controller = new AbortController();
  running.set(request.requestId, controller);

  try {
    await runChat(
      parseChatRequest(request.body),
      frameSender(event.sender, request.requestId),
      controller.signal,
    );

    return controller.signal.aborted ? { status: "aborted" } : { status: "done" };
  } catch (error) {
    if (controller.signal.aborted) {
      return { status: "aborted" };
    }

    return { status: "error", message: message(error) };
  } finally {
    running.delete(request.requestId);
  }
}

export function cancelChat(requestId: unknown): void {
  if (typeof requestId !== "string") {
    return;
  }

  running.get(requestId)?.abort();
}

/** Aborts everything still running — used when the window goes away. */
export function cancelAll(): void {
  for (const controller of running.values()) {
    controller.abort();
  }

  running.clear();
}

export function summarizeTurn(
  body: unknown,
): Promise<Result<{ summary: string; model: string }>> {
  return attempt(() => runSummarize(parseSummarizeRequest(body)));
}

export function cheatsheet(
  body: unknown,
): Promise<Result<{ cheatsheet: string; model: string }>> {
  return attempt(() => runCheatsheet(parseCheatsheetRequest(body)));
}

export const sessions = {
  list: () => attempt(async () => listAll()),
  get: (id: unknown) => attempt(async () => read(id)),
  put: (id: unknown, body: unknown) => attempt(async () => write(id, body)),
  remove: (id: unknown) => attempt(async () => remove(id)),
};

export interface HealthPayload {
  status: "ok" | "degraded";
  model?: string;
  summaryModel?: string;
  error?: string;
}

/**
 * Whether the app can actually do anything yet.
 *
 * Reads the configuration rather than calling OpenAI: a round trip on every
 * window open is a cost with no answer this needs. A bad key surfaces on the
 * first turn, with the API's own message.
 */
export function health(): HealthPayload {
  if (!hasApiKey()) {
    return { status: "degraded", error: "No OpenAI API key is stored." };
  }

  const { openaiModel, openaiSummaryModel } = config();

  return { status: "ok", model: openaiModel, summaryModel: openaiSummaryModel };
}
