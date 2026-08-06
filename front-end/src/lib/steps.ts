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

/** The step after `step`, or null if it is the last one. */
export function nextStep(step: DesignStep): DesignStep | null {
  const index = DESIGN_STEPS.indexOf(step);
  return DESIGN_STEPS[index + 1] ?? null;
}

/** How a step ended. */
export type StepExit = "signed-off" | "forced";

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
  step: DesignStep;
  enteredAt: string;
  exitedAt: string | null;
  /** null while this is the current step. */
  exit: StepExit | null;
  /** Assistant replies delivered within it. */
  turnCount: number;
}
