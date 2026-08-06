import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { config } from "./config.js";

/**
 * One JSON file per design session, on the local disk.
 *
 * A run through the Biomimicry Design Process takes a long time, so losing it to
 * a reload is not acceptable. Local files keep the transcripts on the machine,
 * which also matches the privacy posture — nothing about a design leaves except
 * what goes to OpenAI in the request itself.
 *
 * The front-end owns session state and PUTs the whole thing after each turn. This
 * module only writes bytes; the chat and summarize endpoints stay stateless.
 */

/**
 * Ids come off the URL and become filenames, so they are checked rather than
 * trusted. Without this, `GET /api/sessions/..%2F..%2Fetc%2Fpasswd` is a file
 * read.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidSessionId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/**
 * Metadata for a session listing.
 *
 * `stepHistory` is passed through whole rather than reduced to a count here. The
 * front-end owns what a step visit means and already derives progress from it;
 * computing that twice, in two languages, is how the two answers start disagreeing.
 * It is five small objects per session, so the size is not the concern.
 */
export interface SessionSummary {
  id: string;
  createdAt: unknown;
  updatedAt: unknown;
  title: unknown;
  /** Absent in sessions saved before titles existed. */
  named: unknown;
  currentStep: unknown;
  turnCount: number;
  stepHistory: unknown;
}

function fileFor(id: string): string {
  const dir = resolve(config.dataDir);
  const path = resolve(join(dir, `${id}.json`));

  // Belt and braces: the pattern above already forbids separators, but resolve()
  // makes the guarantee explicit rather than implied.
  if (dirname(path) !== dir) {
    throw new Error("Resolved session path escaped the data directory.");
  }

  return path;
}

async function ensureDir(): Promise<void> {
  await mkdir(resolve(config.dataDir), { recursive: true });
}

/**
 * Writes to a temporary file and renames it into place. `rename` is atomic within
 * a filesystem, so a crash mid-write leaves the previous session intact rather
 * than a half-written file — which for an hour-old session matters.
 */
export async function saveSession(
  id: string,
  session: unknown,
): Promise<void> {
  await ensureDir();

  const target = fileFor(id);
  const temporary = `${target}.${process.pid}.tmp`;

  await writeFile(temporary, JSON.stringify(session, null, 2), "utf8");

  try {
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

/** Returns null when the session does not exist. */
export async function loadSession(id: string): Promise<unknown | null> {
  try {
    const raw = await readFile(fileFor(id), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    await unlink(fileFor(id));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

/**
 * Reads every session to build the listing. Deliberately not backed by an index
 * file — an index is one more thing to drift out of sync, and a few hundred small
 * files is milliseconds. Revisit if that stops being true.
 */
export async function listSessions(): Promise<SessionSummary[]> {
  await ensureDir();

  const entries = await readdir(resolve(config.dataDir));
  const summaries: SessionSummary[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }

    const id = entry.slice(0, -".json".length);

    if (!isValidSessionId(id)) {
      continue;
    }

    const session = await loadSession(id);

    if (session === null || typeof session !== "object") {
      continue;
    }

    const record = session as Record<string, unknown>;

    summaries.push({
      id,
      createdAt: record.createdAt ?? null,
      updatedAt: record.updatedAt ?? null,
      title: record.title ?? null,
      named: record.named ?? false,
      currentStep: record.currentStep ?? null,
      turnCount: Array.isArray(record.turns) ? record.turns.length : 0,
      stepHistory: Array.isArray(record.stepHistory) ? record.stepHistory : [],
    });
  }

  // Newest first, so "resume where I left off" is the top of the list.
  summaries.sort((a, b) =>
    String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
  );

  return summaries;
}
