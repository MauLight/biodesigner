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
