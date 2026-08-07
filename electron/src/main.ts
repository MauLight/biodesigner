import { app, BrowserWindow } from "electron";
import path from "node:path";

import { configure } from "back-end/config";
import { serveRenderer } from "./static-server.js";
import type { StaticServer } from "./static-server.js";
import { registerIpc } from "./ipc.js";
import { cancelAll } from "./bridge.js";
import { loadKey } from "./key-store.js";

/**
 * Electron shell for BioDesigner.
 *
 * The renderer is a static Next.js export served over http://127.0.0.1 rather
 * than file:// — for the origin, not the transport. All data travels over IPC
 * instead (see the DesktopBridge contract in the front-end), so the only thing
 * on that port is the bundle.
 */

/**
 * Pin the name before anything asks for a path.
 *
 * `app.getName()` otherwise falls back to package.json's `name`, which differs
 * from the product name and differs again between dev and packaged — three
 * possible userData directories, and stored sessions that seem to vanish when you
 * switch. Setting it once keeps the data directory the same everywhere.
 */
app.setName("BioDesigner");

/** Where the built renderer lives, packaged or not. */
function rendererRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "renderer")
    : // dist/main.js -> electron/ -> repo root -> front-end/out
      path.join(__dirname, "..", "..", "front-end", "out");
}

let mainWindow: BrowserWindow | null = null;
let renderer: StaticServer | null = null;
/** Whatever the window is showing — the dev server or the static build. */
let rendererUrl: string | null = null;

function createWindow(url: string): void {
  rendererUrl = url;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // The renderer is treated as untrusted: no Node, isolated context, and
      // sandboxed. Everything privileged goes through preload's bridge.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Avoids the white flash before the first paint, which against this app's
  // black background is especially ugly.
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // In dev this almost always means `next dev` is not up yet; say so rather than
  // leaving a blank window.
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, code, description): void => {
      console.error(
        `Renderer failed to load ${url} (${code} ${description})` +
          (process.env.RENDERER_URL ? " — is `next dev` running?" : ""),
      );
    },
  );

  mainWindow.on("closed", () => {
    // Stop any reply still streaming, so a closed window does not keep spending
    // tokens on a transcript nobody will read.
    cancelAll();
    mainWindow = null;
  });

  void mainWindow.loadURL(url);
}

/**
 * Points the back-end at this app's data directory and key before anything can
 * read either.
 *
 * `dataDir` matters most: it defaults to "./data", relative to the working
 * directory, which for a packaged app is wherever the user launched it from.
 * Sessions would scatter. `userData` is the same place every time.
 *
 * A missing key is left alone rather than treated as a failure: it is a first-run
 * state, and the renderer's gate is what handles it. The shell deliberately does
 * not fall back to back-end/.env — that made dev skip the onboarding entirely, so
 * the first person to see it would have been whoever installed the build.
 */
async function configureBackEnd(): Promise<void> {
  const stored = await loadKey();

  configure({
    dataDir: path.join(app.getPath("userData"), "sessions"),
    ...(stored === null ? {} : { openaiApiKey: stored }),
  });
}

/**
 * With RENDERER_URL set (`npm run dev`) the window loads the Next dev server
 * instead of the static build, so edits hot-reload in place. Still an
 * http://localhost origin, so the bridge behaves identically — the only
 * difference is who serves the assets.
 *
 * The variable is per-invocation, so `npm start` always gets the static build.
 */
async function start(): Promise<void> {
  await configureBackEnd();
  registerIpc();

  const devUrl = process.env.RENDERER_URL;

  if (devUrl !== undefined && devUrl !== "") {
    console.log(`Loading renderer from ${devUrl} (dev)`);
    createWindow(devUrl);
    return;
  }

  renderer = await serveRenderer(rendererRoot());
  createWindow(renderer.url);
}

void app.whenReady().then(async () => {
  await start();

  // macOS: clicking the dock icon with no windows open reopens one.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && rendererUrl !== null) {
      createWindow(rendererUrl);
    }
  });
});

app.on("window-all-closed", () => {
  // macOS apps normally stay alive with no windows; this one has nothing to do
  // without a window, so it exits everywhere.
  app.quit();
});

app.on("before-quit", () => {
  void renderer?.close();
});
