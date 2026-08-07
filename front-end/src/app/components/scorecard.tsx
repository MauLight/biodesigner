"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Minus, X } from "lucide-react";

import { countCompletedSteps, useSession } from "@/lib/session";
import type { StepVisit } from "@/lib/session";
import { DESIGN_STEPS, isDesignStep } from "@/lib/steps";
import { verdictFor } from "@/lib/verdict";

/**
 * How long writing the brief is expected to take.
 *
 * From measurement — a full five-step cycle came back in a little over twelve
 * seconds — rounded up, because a bar that fills early and then sits still is
 * worse than one that is merely behind.
 */
const ESTIMATE_SECONDS = 18;

/**
 * Where the fill stops on its own.
 *
 * There is no progress to report: it is one request with no intermediate events,
 * so this is elapsed time against an expectation and nothing more. Stopping short
 * of the end is what keeps that honest — the bar never claims to be finished, and
 * the only thing that completes it is the view changing.
 */
const FILL_CEILING = 0.92;

/** Ease-out, so most of the bar arrives at once and the tail creeps. */
const FILL_EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The table's column track, in one place.
 *
 * Header and rows have to agree exactly or the table stops being a table, and
 * they were two identical strings waiting to drift. The narrow track is not
 * cosmetic: at 18rem of fixed columns the two prose columns had almost nothing
 * left in a half-window pane.
 */
const COLUMNS =
  "grid grid-cols-[5rem_8rem_1fr_1fr] gap-x-4 @2xl:grid-cols-[7rem_11rem_1fr_1fr] @2xl:gap-x-5";

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
  const {
    stepHistory,
    title,
    close,
    iteration,
    startNextIteration,
    preparingIteration,
  } = useSession();
  /**
   * Why the next iteration did not start.
   *
   * Local, not the session's `error`: the composer renders that one, and this
   * failure leaves the session untouched — the cycle is still on screen to try
   * again from, which is only obvious if the complaint sits by the button.
   */
  const [blocked, setBlocked] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  async function handleClose(): Promise<void> {
    await close();
  }

  async function handleNextIteration(): Promise<void> {
    setBlocked(await startNextIteration());
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
    <div className="scrollbar-hide h-full w-full overflow-y-auto px-8 py-10 @lg:px-12 @2xl:px-20">
      <header className="flex items-start justify-between gap-x-8 pb-8">
        <div className="flex flex-col gap-y-1">
          <p className="text-small tracking-wide text-teal-700 uppercase">
            {iteration > 1
              ? `Iteration ${iteration} complete`
              : "Cycle complete"}
          </p>
          <h1 className="text-[1.6rem] font-medium text-text">{title}</h1>
          <p className="text-small text-faded-dark">
            {countCompletedSteps(stepHistory)} of {DESIGN_STEPS.length} steps
            {attackFirst === null
              ? " — nothing flagged for a second pass."
              : ` — on a second pass, attack ${attackFirst} first.`}
          </p>
        </div>

        {/* Both ways out of the table, which is otherwise a dead end. Going on is
            the primary one: the whole point of a scorecard that names a weakest
            step is that there is a next pass to spend it on. */}
        <div className="flex shrink-0 flex-col items-end gap-y-2">
          <div className="flex items-center gap-x-3">
            <button
              type="button"
              onClick={handleNextIteration}
              disabled={preparingIteration}
              className="relative cursor-pointer overflow-hidden rounded-md bg-teal-700 px-4 py-2 text-small text-text transition-opacity duration-300 hover:opacity-90 disabled:cursor-default disabled:hover:opacity-100"
            >
              {preparingIteration && reduceMotion !== true && (
                <motion.span
                  aria-hidden
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: FILL_CEILING }}
                  transition={{ duration: ESTIMATE_SECONDS, ease: FILL_EASE }}
                  className="absolute inset-y-0 left-0 w-full origin-left bg-teal-600"
                />
              )}

              {/* Above the fill, which is a sibling rather than a background so
                  it can be clipped by the button's own radius. */}
              <span className="relative">
                {preparingIteration
                  ? "Preparing the brief…"
                  : "Start next iteration"}
              </span>
            </button>

            {/* Demoted to text once there is a real action beside it — two filled
                buttons would give equal weight to going on and walking away. */}
            <button
              type="button"
              onClick={handleClose}
              disabled={preparingIteration}
              className="cursor-pointer rounded-md px-3 py-2 text-small text-faded-dark transition-colors duration-300 hover:text-text2 disabled:cursor-default disabled:text-[#2a2a2a]"
            >
              Close this iteration
            </button>
          </div>

          {/* Writing the brief is the one thing here that can fail, and it fails
              having changed nothing — so the cycle is still on screen to retry
              from. Saying so is the difference between a retry and a lost run. */}
          {blocked !== null && (
            <p className="max-w-xs text-right text-small text-error">
              {blocked}
            </p>
          )}
        </div>
      </header>

      {/* A grid rather than a <table>: the two prose columns need to wrap
          independently, and the rows have no cell borders to align. */}
      <div className="flex flex-col">
        <div
          className={`${COLUMNS} border-b border-border pb-2 text-[0.7rem] font-medium tracking-wide text-faded-dark uppercase`}
        >
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
  const Icon = verdict.icon;

  return (
    <div className={`${COLUMNS} border-b border-border py-4 text-small`}>
      <span className="font-medium text-text2">{visit.step}</span>

      <div className="flex flex-col gap-y-1">
        <span
          className={`flex items-center gap-x-1.5 font-medium ${verdict.tone}`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {verdict.label}
        </span>
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
