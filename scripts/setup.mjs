#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform, arch } from "node:process";

/**
 * One command from a fresh clone to a runnable app.
 *
 * Uses only Node builtins so it can run before `npm install` — which it then
 * performs itself. Every step says what it is doing and why a failure matters,
 * because anyone running this is building from source rather than downloading a
 * release.
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

  if (label.includes("renderer")) {
    return "A Next build failure is usually a type error — run `npm run typecheck`.";
  }

  if (label.includes("back-end")) {
    return "tsc failed. `npm run typecheck` shows the same errors without emitting.";
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

console.log(
  `BioDesigner setup — Node ${process.versions.node}, ${platform}/${arch}`,
);

// --- build -------------------------------------------------------------------

const npm = platform === "win32" ? "npm.cmd" : "npm";

if (existsSync("node_modules")) {
  console.log("\n▸ Dependencies already installed — skipping");
} else {
  run(npm, ["install"], "Installing dependencies (all workspaces)");
}

run(npm, ["run", "build"], "Building the back-end and the renderer");

// --- configuration ------------------------------------------------------------

// Checked after the build rather than before: a missing key is a five-second
// fix, and finding out about it only once the build has succeeded is friendlier
// than being stopped at the door.
const missing = [
  ["back-end/.env", "OPENAI_API_KEY — copy back-end/.env.example"],
  [
    "front-end/.env.local",
    "NEXT_PUBLIC_API_BASE_URL — copy front-end/.env.local.example",
  ],
].filter(([file]) => !existsSync(file));

console.log("\n✓ Built.\n");

if (missing.length > 0) {
  console.log("Before running, you still need:\n");

  for (const [file, what] of missing) {
    console.log(`  ${file}\n    ${what}`);
  }

  console.log("");
}

console.log(`Then, in two terminals:

  npm run dev:backend
  npm run dev:renderer

The renderer comes up on http://localhost:3000.

Session transcripts are written to back-end/data as one JSON file each. They
stay on this machine — nothing about a design leaves except the requests to
OpenAI.
`);
