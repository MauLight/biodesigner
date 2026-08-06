/**
 * The five steps of the Biomimicry Design Process, in order.
 *
 * Duplicated from `back-end/src/steps.ts` on purpose — the two folders are
 * independent packages with no shared workspace, so there is nowhere to put a
 * common module. Keep them in sync; the API rejects any step it doesn't know.
 */
export const DESIGN_STEPS = [
  "Define",
  "Biologize",
  "Discover",
  "Abstract",
  "Emulate",
] as const;

export type DesignStep = (typeof DESIGN_STEPS)[number];

export function isDesignStep(value: unknown): value is DesignStep {
  return DESIGN_STEPS.some((step) => step === value);
}

/**
 * The terminal state, after Emulate.
 *
 * Not a member of `DESIGN_STEPS` on purpose. That array is the Biomimicry Design
 * Process itself, and everything keyed by it — the criteria, the step cards,
 * progress out of five — would otherwise need an entry for a step that has no
 * content of its own.
 *
 * It is somewhere the conversation can sit, though, and that is what lets the
 * ordinary transition close Emulate's visit and collect its report.
 */
export const FINISH_STEP = "Finish";

/** Where a conversation can be: one of the five, or done. */
export type SessionStep = DesignStep | typeof FINISH_STEP;

export function isSessionStep(value: unknown): value is SessionStep {
  return value === FINISH_STEP || isDesignStep(value);
}

/** What follows `step`, or null once there is nothing after it. */
export function nextStep(step: SessionStep): SessionStep | null {
  if (step === FINISH_STEP) {
    return null;
  }

  const index = DESIGN_STEPS.indexOf(step);

  return DESIGN_STEPS[index + 1] ?? FINISH_STEP;
}

/** How a step ended. */
export type StepExit = "signed-off" | "forced";

/**
 * BIDARA's report on a step, captured as the conversation leaves it.
 *
 * The two booleans are the floor and handoff tests from the back-end's
 * `STEP_CRITERIA`, answered — not a second opinion formed later. After a
 * signed-off exit both are true by construction, so they only carry information
 * when the user moved on early, which is where a scorecard is worth reading.
 *
 * Null when BIDARA's report was missing or malformed. The row still has its exit
 * reason, so the scorecard degrades rather than breaks.
 */
export interface StepAssessment {
  floorMet: boolean;
  handoffMet: boolean;
  strengths: string[];
  gaps: string[];
}

/**
 * A period spent on one step.
 *
 * `exit` is the part that can't be reconstructed later: whether BIDARA agreed the
 * step was satisfied, or the user pushed past it. The end-of-session review judges
 * sufficiency from the transcript, but only this records what actually happened —
 * and the disagreement between the two is the useful signal.
 *
 * Lives here rather than in `session.tsx` because both the session and the API
 * client need it, and `session.tsx` already imports the client — putting it there
 * would make the two modules import each other.
 */
export interface StepVisit {
  step: SessionStep;
  enteredAt: string;
  exitedAt: string | null;
  /** null while this is the current step. */
  exit: StepExit | null;
  /** Assistant replies delivered within it. */
  turnCount: number;
  /** What BIDARA made of the step on the way out. Null if it never reported. */
  assessment: StepAssessment | null;
}
