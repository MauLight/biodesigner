import { Router } from "express";
import type { Request, Response, NextFunction } from "express";

import { config } from "../config.js";
import { summarize } from "../openai.js";
import type { Speaker } from "../summarizer.js";

const MAX_TEXT_LENGTH = 32_000;

class BadRequestError extends Error {}

interface SummarizeRequest {
  text: string;
  speaker: Speaker;
}

function parseRequest(body: unknown): SummarizeRequest {
  if (typeof body !== "object" || body === null) {
    throw new BadRequestError("Request body must be a JSON object.");
  }

  const { text, speaker } = body as { text?: unknown; speaker?: unknown };

  if (typeof text !== "string") {
    throw new BadRequestError("`text` must be a string.");
  }

  if (text.trim() === "") {
    throw new BadRequestError("`text` must not be empty.");
  }

  if (text.length > MAX_TEXT_LENGTH) {
    throw new BadRequestError(
      `\`text\` must be at most ${MAX_TEXT_LENGTH} characters.`,
    );
  }

  if (speaker !== "user" && speaker !== "assistant") {
    throw new BadRequestError("`speaker` must be 'user' or 'assistant'.");
  }

  return { text, speaker };
}

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
  let parsed: SummarizeRequest;

  try {
    parsed = parseRequest(req.body);
  } catch (error) {
    if (error instanceof BadRequestError) {
      res.status(400).json({ error: error.message });
      return;
    }

    next(error);
    return;
  }

  try {
    const summary = await summarize(parsed.text, parsed.speaker);
    res.json({ summary, model: config.openaiSummaryModel });
  } catch (error) {
    next(error);
  }
}

export const summarizeRouter: Router = Router();

summarizeRouter.post("/summarize", handleSummarize);
