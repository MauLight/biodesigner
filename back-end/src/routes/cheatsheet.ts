import { Router } from "express";
import type { Request, Response, NextFunction } from "express";

import {
  parseCheatsheetRequest,
  runCheatsheet,
} from "../core/cheatsheet.js";
import { BadRequestError } from "../core/errors.js";

/**
 * A finished cycle in, the opening brief for the next one out.
 *
 * Nothing is stored here. The client owns the session documents and decides what
 * to do with the brief — which for now is to save it against the cycle that
 * produced it and post it as the first message of the one that follows.
 */
async function handleCheatsheet(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(await runCheatsheet(parseCheatsheetRequest(req.body)));
  } catch (error) {
    if (error instanceof BadRequestError) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  }
}

export const cheatsheetRouter: Router = Router();

cheatsheetRouter.post("/cheatsheet", handleCheatsheet);
