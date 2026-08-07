import type { SessionSummary } from "./api";

/**
 * The contract between the renderer and the Electron main process.
 *
 * Under Electron the renderer makes no HTTP calls of its own. The page is served
 * from http://127.0.0.1 purely so the document has a real web origin; every
 * request travels over IPC instead, which is why the desktop build has no API
 * port to reach at all. In a plain browser `window.desktop` is absent and
 * `lib/api.ts` falls back to HTTP.
 *
 * Streaming mirrors SSE so both transports feed the same handling:
 *   - the caller mints a `requestId` and passes it in
 *   - main pushes frames back as (event, data) pairs on one shared channel
 *   - `cancel(requestId)` is what an AbortSignal maps onto
 *   - the returned promise settles when the turn ends, and rejects when it is
 *     cancelled. The rejection's `name` cannot be relied on — contextBridge
 *     copies errors keeping only `message` and `stack` — so callers re-derive an
 *     abort from their own signal.
 *
 * The API key is deliberately absent. Main owns it through safeStorage and hands
 * it to the back-end directly, so it never crosses this boundary; `key.status`
 * answers whether one exists, and nothing offers to read it.
 */

export type FrameListener = (
  event: string,
  data: Record<string, unknown>,
) => void;

export interface ChatBody {
  messages: { role: string; content: string }[];
  currentStep: string;
  forcedAdvance: boolean;
}

export interface HealthPayload {
  status: "ok" | "degraded";
  model?: string;
  summaryModel?: string;
  error?: string;
}

export interface DesktopBridge {
  chat: {
    /** Resolves when the turn ends; rejects when it is cancelled or fails. */
    start: (
      body: ChatBody,
      requestId: string,
      onFrame: FrameListener,
    ) => Promise<void>;
    cancel: (requestId: string) => void;
  };
  summarize: (body: {
    text: string;
    speaker: string;
  }) => Promise<{ summary: string; model: string }>;
  cheatsheet: (body: {
    title: string;
    visits: unknown;
    turns: unknown;
  }) => Promise<{ cheatsheet: string; model: string }>;
  sessions: {
    list: () => Promise<SessionSummary[]>;
    /** Null when there is no such session. */
    get: (id: string) => Promise<unknown | null>;
    put: (id: string, session: unknown) => Promise<string>;
    /** False when there was no such session to begin with. */
    remove: (id: string) => Promise<boolean>;
  };
  /** Backed by Electron's safeStorage — the only place the key is kept. */
  key: {
    /** Whether one is stored. Never the value. */
    status: () => Promise<boolean>;
    save: (value: string) => Promise<void>;
    clear: () => Promise<void>;
  };
  health: () => Promise<HealthPayload>;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

/** The bridge when running under Electron, otherwise null. */
export function getDesktop(): DesktopBridge | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.desktop ?? null;
}
