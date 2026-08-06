"use client";

import { Check, Minus, X } from "lucide-react";

import { countCompletedSteps, useSession } from "@/lib/session";
import type { StepVisit } from "@/lib/session";
import { DESIGN_STEPS, isDesignStep } from "@/lib/steps";

/**
 * How a step came out, as one label.
 *
 * `rank` orders them by how much attention they need, which is what picks the
 * step to attack first. It is not a score: the four outcomes are categories, and
 * averaging them would produce the mushy "everything needs work" answer that made
 * a separate evaluator useless.
 */
interface Verdict {
  rank: number;
  label: string;
  tone: string;
}

const MET: Verdict = {
  rank: 0,
  label: "Met the bar",
  tone: "text-teal-600",
};

const UNREPORTED: Verdict = {
  rank: 0,
  label: "No report",
  tone: "text-faded-dark",
};

function verdictFor(visit: StepVisit): Verdict {
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
    };
  }

  if (!handoffMet) {
    return {
      rank: 2,
      label: "Thin for the next step",
      tone: "text-secondary",
    };
  }

  // Both tests passed. If the user pushed past anyway, that is worth saying —
  // it cost nothing, and knowing that is as useful as knowing it did.
  return visit.exit === "forced"
    ? { rank: 1, label: "Passed anyway", tone: "text-teal-700" }
    : MET;
}

/**
 * The end-of-cycle scorecard.
 *
 * Built entirely from `stepHistory` — no end-of-session evaluation pass. Each row
 * is the report BIDARA gave as it left that step, against the same floor and
 * handoff it uses to decide readiness in the first place. The one thing the model
 * never saw is `exit`: whether the user accepted the move or forced it. That is
 * why the two together say more than either alone, and why "Passed anyway" is a
 * row worth having.
 */
export default function Scorecard() {
  const { stepHistory, title, close } = useSession();

  async function handleClose(): Promise<void> {
    await close();
  }

  // Finish carries no assessment of its own; it exists so Emulate can close.
  const rows = stepHistory.filter((visit) => isDesignStep(visit.step));

  const worst = rows.reduce<StepVisit | null>((found, visit) => {
    if (found === null) {
      return visit;
    }

    // Strictly greater, so ties keep the earlier step — an early gap is what the
    // later ones inherited.
    return verdictFor(visit).rank > verdictFor(found).rank ? visit : found;
  }, null);

  const attackFirst =
    worst !== null && verdictFor(worst).rank > 0 ? worst.step : null;

  return (
    <div className="scrollbar-hide h-full w-full overflow-y-auto px-20 py-10">
      <header className="flex items-start justify-between gap-x-8 pb-8">
        <div className="flex flex-col gap-y-1">
          <p className="text-small tracking-wide text-teal-700 uppercase">
            Cycle complete
          </p>
          <h1 className="text-[1.6rem] font-medium text-text">{title}</h1>
          <p className="text-small text-faded-dark">
            {countCompletedSteps(stepHistory)} of {DESIGN_STEPS.length} steps
            {attackFirst === null
              ? " — nothing flagged for a second pass."
              : ` — on a second pass, attack ${attackFirst} first.`}
          </p>
        </div>

        {/* The way out. Reading the table is the last thing this session is for,
            so without this the user is left on a screen with nothing to do.
            `close` saves on the way, which is why it does not ask first. */}
        <button
          type="button"
          onClick={handleClose}
          className="shrink-0 cursor-pointer rounded-md bg-teal-700 px-4 py-2 text-small text-text transition-opacity duration-300 hover:opacity-90"
        >
          Close this iteration
        </button>
      </header>

      {/* A grid rather than a <table>: the two prose columns need to wrap
          independently, and the rows have no cell borders to align. */}
      <div className="flex flex-col">
        <div className="grid grid-cols-[7rem_11rem_1fr_1fr] gap-x-5 border-b border-border pb-2 text-[0.7rem] font-medium tracking-wide text-faded-dark uppercase">
          <span>Step</span>
          <span>Outcome</span>
          <span>Strengths</span>
          <span>To revisit</span>
        </div>

        {rows.map((visit, index) => (
          <Row key={`${visit.step}-${index}`} visit={visit} />
        ))}
      </div>
    </div>
  );
}

function Row({ visit }: { visit: StepVisit }) {
  const verdict = verdictFor(visit);

  return (
    <div className="grid grid-cols-[7rem_11rem_1fr_1fr] gap-x-5 border-b border-border py-4 text-small">
      <span className="font-medium text-text2">{visit.step}</span>

      <div className="flex flex-col gap-y-1">
        <span className={`font-medium ${verdict.tone}`}>{verdict.label}</span>
        <div className="flex flex-col gap-y-0.5 text-[0.75rem] text-faded-dark">
          <Test label="floor" met={visit.assessment?.floorMet} />
          <Test label="handoff" met={visit.assessment?.handoffMet} />
          <span>
            {visit.exit === "forced"
              ? "moved on early"
              : visit.exit === "signed-off"
                ? "signed off"
                : "still open"}
          </span>
        </div>
      </div>

      <Points items={visit.assessment?.strengths ?? []} />
      <Points items={visit.assessment?.gaps ?? []} />
    </div>
  );
}

/** `undefined` means no report at all, which is not the same as "not met". */
function Test({ label, met }: { label: string; met: boolean | undefined }) {
  if (met === undefined) {
    return (
      <span className="flex items-center gap-x-1">
        <Minus className="h-3 w-3" />
        {label}
      </span>
    );
  }

  return (
    <span
      className={`flex items-center gap-x-1 ${met ? "text-teal-700" : "text-error"}`}
    >
      {met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {label}
    </span>
  );
}

function Points({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span className="text-faded-dark">—</span>;
  }

  return (
    <ul className="flex flex-col gap-y-1 text-text2">
      {items.map((item) => (
        <li key={item} className="before:mr-1.5 before:content-['·']">
          {item}
        </li>
      ))}
    </ul>
  );
}
