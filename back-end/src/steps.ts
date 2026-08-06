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

/** The step after `step`, or null if it is the last one. */
export function nextStep(step: DesignStep): DesignStep | null {
  const index = DESIGN_STEPS.indexOf(step);
  return DESIGN_STEPS[index + 1] ?? null;
}
