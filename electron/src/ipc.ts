import { ipcMain } from "electron";

import { configure } from "back-end/config";
import { clearKey, loadKey, saveKey } from "./key-store.js";
import {
  cancelChat,
  cheatsheet,
  health,
  sessions,
  startChat,
  summarizeTurn,
} from "./bridge.js";

/**
 * Every channel the renderer can reach.
 *
 * Enumerated here and mirrored one-to-one in preload. The renderer never sees
 * `ipcRenderer` itself, so this list is the whole attack surface — which is the
 * reason the app has no HTTP API at all in the desktop build.
 *
 * `chat:frame` is the one that travels the other way, main to renderer.
 */
export const CHANNELS = {
  chatStart: "chat:start",
  chatCancel: "chat:cancel",
  chatFrame: "chat:frame",
  summarize: "summarize",
  cheatsheet: "cheatsheet",
  sessionsList: "sessions:list",
  sessionsGet: "sessions:get",
  sessionsPut: "sessions:put",
  sessionsDelete: "sessions:delete",
  keyStatus: "key:status",
  keySave: "key:save",
  keyClear: "key:clear",
  health: "health",
} as const;

/**
 * Saving a key reconfigures the back-end in place.
 *
 * Without this the new key would sit in the keychain unused until the next
 * launch, because config resolves once and caches. `configure` invalidates that,
 * and the OpenAI client is keyed on the value so it rebuilds too.
 */
async function storeKey(value: unknown): Promise<void> {
  await saveKey(value);
  configure({ openaiApiKey: (value as string).trim() });
}

async function forgetKey(): Promise<void> {
  await clearKey();
  configure({ openaiApiKey: undefined });
}

export function registerIpc(): void {
  ipcMain.handle(CHANNELS.chatStart, (event, request: unknown) =>
    startChat(event, request),
  );
  // Fire-and-forget: the renderer does not wait on a cancel, it waits on the
  // start call settling.
  ipcMain.on(CHANNELS.chatCancel, (_event, requestId: unknown) =>
    cancelChat(requestId),
  );

  ipcMain.handle(CHANNELS.summarize, (_event, body: unknown) =>
    summarizeTurn(body),
  );
  ipcMain.handle(CHANNELS.cheatsheet, (_event, body: unknown) =>
    cheatsheet(body),
  );

  ipcMain.handle(CHANNELS.sessionsList, () => sessions.list());
  ipcMain.handle(CHANNELS.sessionsGet, (_event, id: unknown) =>
    sessions.get(id),
  );
  ipcMain.handle(CHANNELS.sessionsPut, (_event, id: unknown, body: unknown) =>
    sessions.put(id, body),
  );
  ipcMain.handle(CHANNELS.sessionsDelete, (_event, id: unknown) =>
    sessions.remove(id),
  );

  // Never a getter for the key itself — only whether there is one. The renderer
  // has no reason to hold it, so the bridge gives it no way to.
  //
  // The keychain, not the resolved config. Answering from config let a stray
  // OPENAI_API_KEY in the environment satisfy the gate, which meant the desktop
  // app skipped its own onboarding in dev and would have shown it for the first
  // time to whoever installed the build. The shell keeps its own key.
  ipcMain.handle(CHANNELS.keyStatus, async () => (await loadKey()) !== null);
  ipcMain.handle(CHANNELS.keySave, (_event, value: unknown) => storeKey(value));
  ipcMain.handle(CHANNELS.keyClear, () => forgetKey());

  ipcMain.handle(CHANNELS.health, () => health());
}
