/**
 * The five steps of the Biomimicry Design Process, in order.
 *
 * The app owns the current step, not the model. It is passed in on every chat
 * request and BIDARA works within it; BIDARA only signals when it considers the
 * step satisfied. That keeps one source of truth and lets the user force a move
 * forward when a step is dragging.
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
 * Process, and everything keyed by it would otherwise need an entry for a step
 * with no floor, no handoff and no card — `STEP_CRITERIA` would gain a meaningless
 * row, `renderHandoffs()` would put it in the prompt, and progress would read
 * "of 6".
 *
 * It is a step where the conversation can *sit*, though, which is what makes the
 * ordinary transition machinery close Emulate's visit and collect its report.
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
