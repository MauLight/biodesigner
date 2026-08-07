import { Router } from "express";
import type { Request, Response, NextFunction } from "express";

import { listAll, read, remove, write } from "../core/sessions.js";
import { BadRequestError } from "../core/errors.js";

/**
 * A thin file store for design sessions. The front-end owns the session shape and
 * sends the whole thing; this only persists and returns it.
 *
 * Kept separate from chat and summarize on purpose — those remain stateless, and
 * nothing here is in the path of a conversation.
 */

/** One place for the mapping, since all four handlers need the same one. */
function fail(res: Response, next: NextFunction, error: unknown): void {
  if (error instanceof BadRequestError) {
    res.status(400).json({ error: error.message });
    return;
  }

  next(error);
}

async function handleList(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json({ sessions: await listAll() });
  } catch (error) {
    fail(res, next, error);
  }
}

async function handleGet(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await read(req.params.id);

    if (session === null) {
      res.status(404).json({ error: "No such session." });
      return;
    }

    res.json(session);
  } catch (error) {
    fail(res, next, error);
  }
}

async function handlePut(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json({ id: await write(req.params.id, req.body), saved: true });
  } catch (error) {
    fail(res, next, error);
  }
}

async function handleDelete(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!(await remove(req.params.id))) {
      res.status(404).json({ error: "No such session." });
      return;
    }

    res.json({ id: req.params.id, deleted: true });
  } catch (error) {
    fail(res, next, error);
  }
}

export const sessionsRouter: Router = Router();

sessionsRouter.get("/sessions", handleList);
sessionsRouter.get("/sessions/:id", handleGet);
sessionsRouter.put("/sessions/:id", handlePut);
sessionsRouter.delete("/sessions/:id", handleDelete);
