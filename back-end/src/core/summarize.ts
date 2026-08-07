import { config } from "../config.js";
import { summarize } from "../openai.js";
import type { Speaker } from "../summarizer.js";
import { BadRequestError } from "./errors.js";

const MAX_TEXT_LENGTH = 32_000;

export interface SummarizeInput {
  text: string;
  speaker: Speaker;
}

export function parseSummarizeRequest(body: unknown): SummarizeInput {
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

export async function runSummarize(
  input: SummarizeInput,
): Promise<{ summary: string; model: string }> {
  return {
    summary: await summarize(input.text, input.speaker),
    model: config().openaiSummaryModel,
  };
}
