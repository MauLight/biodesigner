import { Router } from "express";
import type { Request, Response, NextFunction } from "express";

import {
  deleteSession,
  isValidSessionId,
  listSessions,
  loadSession,
  saveSession,
} from "../store.js";

/**
 * A thin file store for design sessions. The front-end owns the session shape and
 * sends the whole thing; this only persists and returns it.
 *
 * Kept separate from chat and summarize on purpose — those remain stateless, and
 * nothing here is in the path of a conversation.
 */

function readId(req: Request, res: Response): string | null {
  const id = req.params.id;

  if (typeof id !== "string" || !isValidSessionId(id)) {
    res
      .status(400)
      .json({ error: "`id` must be 1-128 characters of A-Z, a-z, 0-9, _ or -." });
    return null;
  }

  return id;
}

async function handleList(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json({ sessions: await listSessions() });
  } catch (error) {
    next(error);
  }
}

async function handleGet(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const id = readId(req, res);

  if (id === null) {
    return;
  }

  try {
    const session = await loadSession(id);

    if (session === null) {
      res.status(404).json({ error: "No such session." });
      return;
    }

    res.json(session);
  } catch (error) {
    next(error);
  }
}

async function handlePut(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const id = readId(req, res);

  if (id === null) {
    return;
  }

  const body: unknown = req.body;

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    res.status(400).json({ error: "Request body must be a JSON object." });
    return;
  }

  // The id in the document must not contradict the one in the URL, or a listing
  // and its file would disagree about what a session is called.
  const declared = (body as { id?: unknown }).id;

  if (declared !== undefined && declared !== id) {
    res.status(400).json({ error: "`id` in the body must match the URL." });
    return;
  }

  try {
    await saveSession(id, { ...body, id });
    res.json({ id, saved: true });
  } catch (error) {
    next(error);
  }
}

async function handleDelete(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const id = readId(req, res);

  if (id === null) {
    return;
  }

  try {
    const existed = await deleteSession(id);

    if (!existed) {
      res.status(404).json({ error: "No such session." });
      return;
    }

    res.json({ id, deleted: true });
  } catch (error) {
    next(error);
  }
}

export const sessionsRouter: Router = Router();

sessionsRouter.get("/sessions", handleList);
sessionsRouter.get("/sessions/:id", handleGet);
sessionsRouter.put("/sessions/:id", handlePut);
sessionsRouter.delete("/sessions/:id", handleDelete);

