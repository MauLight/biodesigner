import {
  deleteSession,
  isValidSessionId,
  listSessions,
  loadSession,
  saveSession,
} from "../store.js";
import type { SessionSummary } from "../store.js";
import { BadRequestError } from "./errors.js";

/**
 * Session persistence with its rules attached.
 *
 * `store.ts` writes bytes; this decides what is allowed to reach it. The id check
 * in particular is not optional — ids become filenames, and the Electron bridge
 * takes them from the renderer just as the route takes them from a URL. Putting
 * it here means neither adapter can forget.
 */

export type { SessionSummary };

function assertId(id: unknown): string {
  if (typeof id !== "string" || !isValidSessionId(id)) {
    throw new BadRequestError(
      "`id` must be 1-128 characters of A-Z, a-z, 0-9, _ or -.",
    );
  }

  return id;
}

export async function listAll(): Promise<SessionSummary[]> {
  return listSessions();
}

/** Null when there is no such session. */
export async function read(id: unknown): Promise<unknown | null> {
  return loadSession(assertId(id));
}

export async function write(id: unknown, body: unknown): Promise<string> {
  const checked = assertId(id);

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new BadRequestError("Request body must be a JSON object.");
  }

  // The id in the document must not contradict the one it is filed under, or a
  // listing and its file would disagree about what a session is called.
  const declared = (body as { id?: unknown }).id;

  if (declared !== undefined && declared !== checked) {
    throw new BadRequestError("`id` in the body must match the URL.");
  }

  await saveSession(checked, { ...body, id: checked });

  return checked;
}

/** False when there was no such session to begin with. */
export async function remove(id: unknown): Promise<boolean> {
  return deleteSession(assertId(id));
}
