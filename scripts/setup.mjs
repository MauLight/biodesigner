#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform, arch } from "node:process";

/**
 * One command from a fresh clone to an installed app.
 *
 * Uses only Node builtins so it can run before `npm install` — which it then
 * performs itself. Every step says what it is doing and why a failure matters,
 * because anyone running this is building from source rather than downloading a
 * release. That is the whole distribution model: the repository is the delivery,
 * and the app is built on the machine it runs on.
 */

const MIN_NODE_MAJOR = 20;

function fail(message, hint) {
  console.error(`\n✗ ${message}`);

  if (hint) {
    console.error(`  ${hint}`);
  }

  process.exit(1);
}

function step(label) {
  console.log(`\n▸ ${label}`);
}

function hintFor(label) {
  if (label.includes("Installing")) {
    return "Check your network and retry.";
  }

  if (label.includes("Building")) {
    return "A build failure is usually a type error — `npm run typecheck` shows the same errors without emitting.";
  }

  if (label.includes("Packaging")) {
    return "electron-builder needs an exact Electron version and a writable electron/release/.";
  }

  return "Scroll up for the underlying error.";
}

function run(command, args, label) {
  step(label);
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });

  if (result.error) {
    fail(`${label} could not start.`, result.error.message);
  }

  if (result.status !== 0) {
    fail(`${label} failed.`, hintFor(label));
  }
}

// --- preflight ---------------------------------------------------------------

const nodeMajor = Number(process.versions.node.split(".")[0]);

if (Number.isNaN(nodeMajor) || nodeMajor < MIN_NODE_MAJOR) {
  fail(
    `Node ${MIN_NODE_MAJOR} or newer is required — found ${process.versions.node}.`,
    "Install a current Node (nodejs.org, or `nvm install 20`) and try again.",
  );
}

// Stopped at the door rather than after a five-minute build: only the macOS
// target is configured, so there is nothing for this to produce elsewhere. The
// dev loop below works on any platform.
if (platform !== "darwin") {
  fail(
    `This packages a macOS app; detected ${platform}.`,
    "Windows and Linux targets aren't configured yet. `npm run start:desktop` still runs the app from source.",
  );
}

console.log(
  `BioDesigner setup — Node ${process.versions.node}, ${platform}/${arch}`,
);

// --- build -------------------------------------------------------------------

const npm = platform === "win32" ? "npm.cmd" : "npm";

if (existsSync("node_modules")) {
  console.log("\n▸ Dependencies already installed — skipping");
} else {
  run(npm, ["install"], "Installing dependencies (all three workspaces)");
}

run(npm, ["run", "build"], "Building the back-end, the renderer and the shell");
run(npm, ["run", "package", "--workspace", "electron"], "Packaging the app");

console.log(`
✓ Done.

  App:  electron/release/mac-${arch}/BioDesigner.app
  DMG:  electron/release/BioDesigner-0.1.0-${arch}.dmg

Drag the app to /Applications, or open it where it is.

On first launch it asks for your OpenAI API key. It is encrypted into the macOS
keychain and never reaches the page — the main process reads it when it makes a
request.

The app is unsigned, which is fine because you built it yourself: macOS only
blocks unsigned apps that arrive with a quarantine flag, and locally built ones
do not have one.

Design sessions are written to the app's own data directory
(~/Library/Application Support/BioDesigner/sessions), one JSON file each. They
stay on this machine — nothing about a design leaves except the requests to
OpenAI.
`);
