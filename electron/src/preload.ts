import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";

/**
 * The only channel between the renderer and main.
 *
 * Implements the DesktopBridge contract the front-end codes against
 * (front-end/src/lib/desktop.ts). Each method is enumerated explicitly: exposing
 * `ipcRenderer` wholesale would hand the renderer every channel there is.
 */

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

type StreamResult =
  | { status: "done" }
  | { status: "aborted" }
  | { status: "error"; message: string };

type FrameListener = (
  event: string,
  data: Record<string, unknown>,
) => void;

interface Frame {
  requestId: string;
  event: string;
  data: Record<string, unknown>;
}

/**
 * Unwraps the envelope main returns, rethrowing the real message.
 *
 * Main returns failures rather than rejecting because an `ipcMain.handle`
 * rejection arrives here wrapped in "Error invoking remote method ...". These
 * messages are the ones the HTTP path puts in a 400 body — the user reads them.
 */
async function unwrap<T>(pending: Promise<Result<T>>): Promise<T> {
  const result = await pending;

  if (!result.ok) {
    throw new Error(result.message);
  }

  return result.value;
}

/**
 * Runs one turn to completion.
 *
 * Frames for every turn share a single channel, so each call filters by its own
 * requestId. The listener is removed however the turn ends, or a long session
 * would accumulate one per message.
 */
async function startChat(
  body: unknown,
  requestId: string,
  onFrame: FrameListener,
): Promise<void> {
  function handleFrame(_event: IpcRendererEvent, frame: Frame): void {
    if (frame.requestId !== requestId) {
      return;
    }

    onFrame(frame.event, frame.data);
  }

  ipcRenderer.on("chat:frame", handleFrame);

  let result: StreamResult;

  try {
    result = await ipcRenderer.invoke("chat:start", { body, requestId });
  } finally {
    ipcRenderer.removeListener("chat:frame", handleFrame);
  }

  if (result.status === "aborted") {
    // contextBridge copies errors keeping only message and stack, so a `name`
    // set here would not survive. The renderer re-derives the abort from its own
    // signal instead — see lib/api.ts.
    throw new Error("Aborted");
  }

  if (result.status === "error") {
    throw new Error(result.message);
  }
}

const desktop = {
  chat: {
    start: startChat,
    cancel: (requestId: string): void => {
      ipcRenderer.send("chat:cancel", requestId);
    },
  },
  summarize: (body: unknown) => unwrap(ipcRenderer.invoke("summarize", body)),
  cheatsheet: (body: unknown) => unwrap(ipcRenderer.invoke("cheatsheet", body)),
  sessions: {
    list: () => unwrap(ipcRenderer.invoke("sessions:list")),
    get: (id: string) => unwrap(ipcRenderer.invoke("sessions:get", id)),
    put: (id: string, session: unknown) =>
      unwrap(ipcRenderer.invoke("sessions:put", id, session)),
    remove: (id: string) => unwrap(ipcRenderer.invoke("sessions:delete", id)),
  },
  key: {
    // Whether one is stored, never the value.
    status: (): Promise<boolean> => ipcRenderer.invoke("key:status"),
    save: (value: string): Promise<void> =>
      ipcRenderer.invoke("key:save", value),
    clear: (): Promise<void> => ipcRenderer.invoke("key:clear"),
  },
  health: () => ipcRenderer.invoke("health"),
};

contextBridge.exposeInMainWorld("desktop", desktop);
