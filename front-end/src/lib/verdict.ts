import { Check, Minus, TriangleAlert, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { StepVisit } from "./steps";

/**
 * How a step came out, as one label.
 *
 * `rank` orders them by how much attention they need, which is what picks the
 * step to attack first. It is not a score: the four outcomes are categories, and
 * averaging them would produce the mushy "everything needs work" answer that made
 * a separate evaluator useless.
 *
 * Lives here rather than beside either view. The ledger shows this judgement as
 * the step closes and the scorecard shows it again at the end of the cycle — the
 * same step must not come out differently in the two places.
 */
export interface Verdict {
  rank: number;
  label: string;
  tone: string;
  /** Carries the outcome at a glance, before the label is read. */
  icon: LucideIcon;
}

const MET: Verdict = {
  rank: 0,
  label: "Met the bar",
  tone: "text-teal-600",
  icon: Check,
};

const UNREPORTED: Verdict = {
  rank: 0,
  label: "No report",
  tone: "text-faded-dark",
  // Nothing was judged, so neither a pass nor a fail mark would be true.
  icon: Minus,
};

export function verdictFor(visit: StepVisit): Verdict {
  // Nothing was captured — BIDARA declined to report, or the report was
  // malformed. Ranked harmless rather than bad: absence of evidence.
  if (visit.assessment === null) {
    return UNREPORTED;
  }

  const { floorMet, handoffMet } = visit.assessment;

  if (!floorMet) {
    return {
      rank: 3,
      label: "Below the floor",
      tone: "text-error",
      icon: X,
    };
  }

  if (!handoffMet) {
    return {
      rank: 2,
      label: "Thin for the next step",
      tone: "text-secondary",
      // Not an X: the step itself held up, it just left the next one short.
      icon: TriangleAlert,
    };
  }

  // Both tests passed. If the user pushed past anyway, that is worth saying —
  // it cost nothing, and knowing that is as useful as knowing it did.
  return visit.exit === "forced"
    ? {
        rank: 1,
        label: "Passed anyway",
        tone: "text-teal-700",
        icon: Check,
      }
    : MET;
}
