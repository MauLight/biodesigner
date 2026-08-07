import { config } from "../config.js";
import { writeCheatsheet } from "../openai.js";
import type { TranscriptTurn, VisitInput } from "../cheatsheet.js";
import type { StepAssessment } from "../criteria.js";
import { BadRequestError } from "./errors.js";

/**
 * Validation and dispatch for the carry-forward brief, with no transport
 * attached. Both the HTTP route and the Electron bridge parse through here, so a
 * request the server rejects is rejected the same way in the desktop app.
 */

export interface CheatsheetInput {
  title: string;
  visits: VisitInput[];
  turns: TranscriptTurn[];
}

/** A whole cycle's transcript, so far more generous than one turn. */
const MAX_TRANSCRIPT_LENGTH = 200_000;
const MAX_TURNS = 400;

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Same shape the chat route emits, arriving back from the client. */
function readAssessment(value: unknown): StepAssessment | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  return {
    floorMet: record.floorMet === true,
    handoffMet: record.handoffMet === true,
    strengths: strings(record.strengths),
    gaps: strings(record.gaps),
  };
}

function readVisits(value: unknown): VisitInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const visits: VisitInput[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const record = entry as Record<string, unknown>;

    if (typeof record.step !== "string") {
      continue;
    }

    visits.push({
      step: record.step,
      exit:
        record.exit === "signed-off" || record.exit === "forced"
          ? record.exit
          : null,
      assessment: readAssessment(record.assessment),
    });
  }

  return visits;
}

function readTurns(value: unknown): TranscriptTurn[] {
  if (!Array.isArray(value)) {
    throw new BadRequestError("`turns` must be an array.");
  }

  if (value.length === 0) {
    throw new BadRequestError("`turns` must not be empty.");
  }

  if (value.length > MAX_TURNS) {
    throw new BadRequestError(
      `\`turns\` must hold at most ${MAX_TURNS} turns.`,
    );
  }

  const turns: TranscriptTurn[] = [];
  let total = 0;

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      throw new BadRequestError("Each turn must be an object.");
    }

    const record = entry as Record<string, unknown>;

    if (record.role !== "user" && record.role !== "assistant") {
      throw new BadRequestError(
        "Each turn's `role` must be user or assistant.",
      );
    }

    if (typeof record.content !== "string") {
      throw new BadRequestError("Each turn's `content` must be a string.");
    }

    total += record.content.length;

    if (total > MAX_TRANSCRIPT_LENGTH) {
      throw new BadRequestError(
        `The transcript must be at most ${MAX_TRANSCRIPT_LENGTH} characters.`,
      );
    }

    turns.push({ role: record.role, content: record.content });
  }

  return turns;
}

/**
 * Visits are read leniently and turns strictly.
 *
 * A missing or malformed verdict costs the brief some detail and is worth
 * proceeding without — the transcript still holds the work. A malformed
 * transcript means there is nothing to write a brief from, so that is an error.
 */
export function parseCheatsheetRequest(body: unknown): CheatsheetInput {
  if (typeof body !== "object" || body === null) {
    throw new BadRequestError("Request body must be a JSON object.");
  }

  const { title, visits, turns } = body as {
    title?: unknown;
    visits?: unknown;
    turns?: unknown;
  };

  if (title !== undefined && typeof title !== "string") {
    throw new BadRequestError("`title` must be a string.");
  }

  return {
    title: title ?? "Untitled challenge",
    visits: readVisits(visits),
    turns: readTurns(turns),
  };
}


export async function runCheatsheet(
  input: CheatsheetInput,
): Promise<{ cheatsheet: string; model: string }> {
  return {
    cheatsheet: await writeCheatsheet(input.title, input.visits, input.turns),
    model: config().openaiModel,
  };
}
