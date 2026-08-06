"use client";

import { countCompletedSteps, useSession } from "@/lib/session";
import { DESIGN_STEPS } from "@/lib/steps";

/**
 * How far through the process this session has got.
 *
 * The counting rule lives in `countCompletedSteps`, shared with the saved-project
 * listing — including the caveat that it tops out one short of the total, because
 * the last step is never exited.
 */
export default function StepProgress() {
  const { stepHistory } = useSession();

  return (
    <p className="text-small text-teal-600">
      {countCompletedSteps(stepHistory)} of {DESIGN_STEPS.length} steps completed
    </p>
  );
}
