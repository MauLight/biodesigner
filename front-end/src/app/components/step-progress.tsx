"use client";

import { countCompletedSteps, useSession } from "@/lib/session";
import { DESIGN_STEPS } from "@/lib/steps";

/**
 * How far through the process this session has got.
 *
 * The counting rule lives in `countCompletedSteps`, shared with the saved-project
 * listing, so the header and the trees can't report different numbers for the same
 * session. It reads five of five only once the challenge is closed.
 */
export default function StepProgress() {
  const { stepHistory } = useSession();

  return (
    <p className="text-small text-teal-600">
      {countCompletedSteps(stepHistory)} of {DESIGN_STEPS.length} steps completed
    </p>
  );
}
