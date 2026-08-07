import { Router } from "express";
import type { Request, Response, NextFunction } from "express";

import {
  parseSummarizeRequest,
  runSummarize,
} from "../core/summarize.js";
import { BadRequestError } from "../core/errors.js";

/**
 * One turn in, one ledger sentence out. `speaker` picks the subject noun —
 * "Human" for the user, "BioDesigner" for the model — so the front-end gets a
 * consistent third-person record of the whole session, both sides of it.
 *
 * No step here on purpose: the client owns the current step and tags entries
 * itself, which is more reliable than asking a model to infer one from a single
 * decontextualized turn.
 */
async function handleSummarize(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(await runSummarize(parseSummarizeRequest(req.body)));
  } catch (error) {
    if (error instanceof BadRequestError) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
  }
}

export const summarizeRouter: Router = Router();

summarizeRouter.post("/summarize", handleSummarize);
