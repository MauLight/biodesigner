import { DESIGN_STEPS, nextStep } from "./steps.js";
import type { DesignStep } from "./steps.js";

/**
 * When a step counts as satisfied.
 *
 * Two tests per step, and the distinction between them is the whole point.
 *
 * The **floor** is the minimum content the step must produce. The **handoff** is
 * what the next step needs from it — which is also the ceiling, the only
 * legitimate reason to ask for more. "How good is this?" has no ceiling and a
 * model asked that question will find fault indefinitely; "is this enough to
 * start the next step?" has a definite answer.
 *
 * This lives here rather than inside the prompt because two callers need it:
 * BIDARA, deciding whether to signal readiness, and the end-of-session review,
 * judging the same bar after the fact. Restating it in both places would let them
 * drift, and then the scorecard contradicts what BIDARA said at the time.
 */
export interface StepCriterion {
  /** Minimum content the step must produce. */
  floor: string;
  /** What the following step needs from it. Phrased to follow "hands X ...". */
  handoff: string;
}

export const STEP_CRITERIA: Record<DesignStep, StepCriterion> = {
  Define: {
    floor:
      "the challenge is stated as an outcome rather than an artifact, context and constraints are given, and the design question conveys context and impact without presupposing a solution",
    handoff: "a design question that can be reframed in biological terms",
  },
  Biologize: {
    floor:
      'at least one "How does nature...?" question exists, together with one inverse or tangential variant',
    handoff: "questions specific enough to search with",
  },
  Discover: {
    floor:
      "at least three biological strategies, spanning more than one organism and more than one scale, with sources",
    handoff:
      "strategies described with enough mechanism to restate functionally",
  },
  Abstract: {
    floor:
      "each strategy restated in plain functional language containing no biological terms",
    handoff: "design strategies free of biological language",
  },
  Emulate: {
    floor:
      "at least one design concept that traces back to a named strategy, considered against Nature's Unifying Patterns",
    handoff: "a concept concrete enough to re-interrogate",
  },
};

/**
 * BIDARA's report on a step, captured as it leaves that step.
 *
 * The two booleans are the two tests above, answered — not a fresh opinion. On a
 * signed-off exit they are true by construction, so they carry information only
 * when the user moved on early, which is exactly where a scorecard is worth
 * reading.
 */
export interface StepAssessment {
  floorMet: boolean;
  handoffMet: boolean;
  strengths: string[];
  gaps: string[];
}

/** At most this many of each, matching what the prompt asks for. */
const MAX_POINTS = 3;

function clauses(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .slice(0, MAX_POINTS);
}

/**
 * Reads the JSON that follows a sentinel.
 *
 * Returns null rather than throwing on anything unexpected. A malformed report
 * costs one row of detail in the scorecard; the step still has its exit reason,
 * and the conversation must not fail over a field the user never sees.
 */
export function parseAssessment(raw: string): StepAssessment | null {
  // Tolerate a code fence and any stray prose around the object, which is the
  // usual way a model disobeys "no code fence, nothing after it".
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end <= start) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;

  // Absent booleans are read as "not met" rather than defaulted to true: a report
  // that fails to claim the bar was cleared has not claimed it.
  return {
    floorMet: record.floorMet === true,
    handoffMet: record.handoffMet === true,
    strengths: clauses(record.strengths),
    gaps: clauses(record.gaps),
  };
}

/** Emulate feeds the next cycle rather than another step. */
function recipient(step: DesignStep): string {
  return nextStep(step) ?? "the next pass of the cycle";
}

export function renderFloors(): string {
  return DESIGN_STEPS.map(
    (step) => `- ${step}: ${STEP_CRITERIA[step].floor}.`,
  ).join("\n");
}

export function renderHandoffs(): string {
  return DESIGN_STEPS.map(
    (step) => `- ${step} hands ${recipient(step)} ${STEP_CRITERIA[step].handoff}.`,
  ).join("\n");
}
