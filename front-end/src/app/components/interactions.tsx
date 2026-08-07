"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import type { AnimationPlaybackControls } from "motion/react";

import { useSession } from "@/lib/session";
import type { LedgerEntry, StepVisit } from "@/lib/session";
import { isDesignStep } from "@/lib/steps";
import type { SessionStep } from "@/lib/steps";
import { verdictFor } from "@/lib/verdict";
import { Pointer } from "lucide-react";

/** How close to the bottom still counts as "following along", in pixels. */
const PINNED_THRESHOLD = 60;

/** Entries at the end left untouched. Everything older recedes. */
const CLEAR_ENTRIES = 3;

/**
 * How long the ledger takes to glide back to the newest entry.
 *
 * Fixed rather than scaled by distance: this is a settling gesture, not travel,
 * and a deep history should not take proportionally longer to leave behind.
 */
const GLIDE_SECONDS = 0.9;

/**
 * How much of the ledger's height the entries must fill before the veil explains
 * itself.
 *
 * The gradient over an empty top edge costs nothing, but the instruction under it
 * does: "hover to reveal" pointing at three legible lines names a control that
 * uncovers nothing. Measured against the height rather than counted in entries,
 * because a summary is one line or three depending on how the turn went.
 */
const COVER_RATIO = 0.5;

/** Where the recession bottoms out — legible as shape, not as words. */
const MAX_BLUR_PX = 3;
const MIN_OPACITY = 0.45;

/**
 * How far an entry has receded, by its distance from the newest one.
 *
 * Counted in entries rather than measured in pixels: the ledger is a list of
 * turns, and "the last three" is a fact about the conversation. A pixel gradient
 * would blur by where a line happened to land, which changes with summary length.
 */
function recession(fromEnd: number): { filter: string; opacity: number } {
  if (fromEnd < CLEAR_ENTRIES) {
    return { filter: "none", opacity: 1 };
  }

  const depth = fromEnd - CLEAR_ENTRIES + 1;

  return {
    filter: `blur(${Math.min(depth, MAX_BLUR_PX)}px)`,
    opacity: Math.max(1 - depth * 0.18, MIN_OPACITY),
  };
}

interface StepGroup {
  step: SessionStep;
  entries: LedgerEntry[];
}

/**
 * Groups consecutive entries by step. Steps only ever move forward, so a step's
 * entries are always contiguous — grouping consecutively rather than bucketing by
 * key keeps the original order and handles a step being revisited.
 */
function groupByStep(entries: LedgerEntry[]): StepGroup[] {
  const groups: StepGroup[] = [];

  for (const entry of entries) {
    const last = groups.at(-1);

    if (last !== undefined && last.step === entry.step) {
      last.entries.push(entry);
    } else {
      groups.push({ step: entry.step, entries: [entry] });
    }
  }

  return groups;
}

/**
 * The session ledger, above the composer.
 *
 * One line per turn, both sides of the conversation, grouped under the design
 * step it happened in. This grouping is the user's progress indicator — BIDARA no
 * longer narrates the process in prose, so the structure lives here instead.
 *
 * The list is bottom-anchored via `mt-auto`, so the newest entry sits just above
 * the composer and older ones stack upward. `mt-auto` rather than
 * `justify-end`, which clips the top of overflowing content in some browsers.
 *
 * Clicking an entry scrolls the transcript to the turn it summarises.
 */
export default function Interactions() {
  const { ledger, stepHistory } = useSession();
  const containerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const entryCountRef = useRef(0);
  /**
   * Pointer is over the ledger, so nothing is receded.
   *
   * Tracked in state rather than done with `group-hover:` because the amount of
   * blur is per-entry and computed, and a Tailwind variant can only toggle a
   * fixed class. It also makes reading the history work by itself: reaching the
   * older entries means scrolling, and scrolling means the pointer is here.
   */
  const [revealed, setRevealed] = useState(false);
  /**
   * The newest entry is in view.
   *
   * The same fact as `pinnedRef`, in state because it has to affect rendering.
   * The ref stays: the scroll effect writes it and reads it back within one
   * commit, which state cannot do.
   */
  const [atBottom, setAtBottom] = useState(true);
  /**
   * The entries have grown far enough up the column to be worth covering.
   *
   * Its own measurement rather than `scrollHeight > clientHeight`: the list is
   * bottom-anchored with `mt-auto`, so the scroller reports its full height long
   * before the content does, and overflow only starts well past the point where
   * the veil has something to hide.
   */
  const [worthCovering, setWorthCovering] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  /** The glide back to the present, while it is running. */
  const glideRef = useRef<AnimationPlaybackControls | null>(null);
  const reduceMotion = useReducedMotion();

  /** Whether the ledger is on screen at all. The empty state renders a spacer. */
  const empty = ledger.length === 0;

  /**
   * Abandons the glide wherever it has got to.
   *
   * Anything that moves the view itself has to call this first, or the glide keeps
   * animating towards the offset it captured on the way out and drags the view
   * back off whatever put it there.
   */
  function stopGlide(): void {
    glideRef.current?.stop();
    glideRef.current = null;
  }

  function handlePointerEnter(): void {
    // Coming back mid-glide hands the scroll straight back to the user.
    stopGlide();
    setRevealed(true);
  }

  /**
   * Leaving returns the ledger to the present.
   *
   * The recession is measured from the newest entry, so it only means anything
   * while the newest entry is what you are looking at. Parked in the history there
   * is no resting state to go back to: either the veil drops over entries the user
   * deliberately scrolled to, or nothing recedes at all and the ledger never
   * settles. Scrolling back makes the resting state reachable again by making it
   * true.
   *
   * The glide is also the cue. Recession and veil fade in on arrival rather than
   * snapping on under a stationary pointer.
   *
   * Animated by hand rather than with `scrollTo({ behavior: "smooth" })`, whose
   * duration is the browser's to choose and is too brisk to read as a return to
   * the present.
   */
  function handlePointerLeave(): void {
    setRevealed(false);
    stopGlide();

    const element = containerRef.current;

    if (element === null) {
      return;
    }

    const target = element.scrollHeight - element.clientHeight;

    if (reduceMotion === true) {
      element.scrollTop = target;
      return;
    }

    glideRef.current = animate(element.scrollTop, target, {
      duration: GLIDE_SECONDS,
      ease: "easeInOut",
      onUpdate: function step(top: number): void {
        element.scrollTop = top;
      },
    });
  }

  function handleScroll(): void {
    const element = containerRef.current;

    if (element === null) {
      return;
    }

    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    const pinned = distance < PINNED_THRESHOLD;

    pinnedRef.current = pinned;
    setAtBottom(pinned);
  }

  // A glide outlives the pointer that started it, so it also has to outlive the
  // component — an unmount mid-glide would otherwise leave it writing scroll
  // offsets onto a detached node until it finished.
  useEffect(() => {
    return () => {
      glideRef.current?.stop();
      glideRef.current = null;
    };
  }, []);

  // Both boxes are watched: the entries grow as the conversation does, and the
  // column they sit in changes with the window. Keyed on whether the ledger has
  // anything in it, because until it does neither element is mounted.
  useEffect(() => {
    const element = containerRef.current;
    const content = contentRef.current;

    if (element === null || content === null) {
      return;
    }

    const observer = new ResizeObserver(function measure(): void {
      setWorthCovering(
        content.offsetHeight > element.clientHeight * COVER_RATIO,
      );
    });

    observer.observe(element);
    observer.observe(content);

    return () => {
      observer.disconnect();
    };
  }, [empty]);

  // A new entry re-pins; a summary merely arriving for an existing one does not.
  // Same reasoning as the transcript: scrolling back through the ledger should
  // not stop your own next turn from coming into view.
  useEffect(() => {
    const element = containerRef.current;

    if (element === null) {
      return;
    }

    const isNewEntry = ledger.length > entryCountRef.current;
    entryCountRef.current = ledger.length;

    if (isNewEntry) {
      // The jump below wins outright, so the glide has to be called off — it is
      // heading for an offset measured before this entry existed.
      glideRef.current?.stop();
      glideRef.current = null;
      pinnedRef.current = true;
    }

    if (pinnedRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [ledger]);

  if (empty) {
    return <div className="min-h-0 flex-1" />;
  }

  const groups = groupByStep(ledger);

  // Position in the whole ledger, not within a group — recession is measured
  // against the newest turn, and groups are just how the list is divided up.
  const positions = new Map(
    ledger.map((entry, index) => [entry.turnId, index]),
  );

  // Keyed by step rather than paired by position. Steps only ever move forward,
  // so a step appears at most once in the history — while the two lists do *not*
  // line up: accepting a move opens the next visit immediately, so there is a
  // visit with no entries behind it for as long as the user takes to reply.
  const visits = new Map(stepHistory.map((visit) => [visit.step, visit]));

  /**
   * Nothing is receding — the whole ledger is legible.
   *
   * Hover is one way there. Being scrolled away from the bottom is the other, and
   * it is not a nicety: recession is measured from the *newest* entry, so with the
   * view parked on older ones everything on screen is far from the end. Blurring
   * on that basis covers the entire visible list, which is what happens the moment
   * the pointer leaves after scrolling back through the history.
   *
   * So the ledger recedes only while it is showing the present. Scroll back to
   * read and it stays readable, hover or not; the next turn re-pins it and the
   * recession returns with it.
   */
  const clear = revealed || !atBottom;

  return (
    <div
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className="relative flex min-h-0 flex-1 flex-col"
    >
      {/* Sibling of the scroller, not a child: inside it the gradient would
          scroll away with the content instead of staying at the top edge.
          `pointer-events-none` keeps it out of the way of scrolling and of the
          hover that dismisses it. */}
      <div
        style={{ opacity: clear ? 0 : 1 }}
        className="pointer-events-none absolute flex flex-col justify-center items-center gap-y-1.5 inset-x-0 top-0 z-10 h-102 bg-linear-to-b from-black via-black/80 to-transparent transition-opacity duration-300 text-[#494949]"
      >
        {/* The gradient is unconditional — it is the column's top edge either
            way. The instruction is not: it only tells the truth once there are
            entries under it to reveal. */}
        {worthCovering && (
          <>
            <Pointer className="w-7 h-7 text-[#393939]" />
            <p className="text-small font-medium">Hover to reveal</p>
          </>
        )}
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div ref={contentRef} className="mt-auto flex flex-col gap-y-4 pb-6">
          {groups.map((group, index) => {
            const visit = visits.get(group.step);
            const last = group.entries.at(-1);

            // Finish carries no assessment of its own, and a document written
            // before that was true could still hold one — it would duplicate
            // Emulate's report under a header of its own.
            const report =
              visit !== undefined &&
              visit.assessment !== null &&
              isDesignStep(group.step)
                ? visit
                : null;

            return (
              <section key={`${group.step}-${index}`} className="flex flex-col">
                <h2 className="mb-1 text-[0.7rem] font-medium tracking-wide text-teal-700 uppercase">
                  {`${index + 1}. ${group.step}`}
                </h2>

                {/* The rule is painted per entry, not here, so each segment can be
                    coloured by speaker. Adjacent borders butt together, so the
                    group still reads as one continuous line. */}
                <ul className="flex flex-col">
                  {group.entries.map((entry) => (
                    <Entry
                      key={entry.turnId}
                      entry={entry}
                      fromEnd={
                        ledger.length - 1 - (positions.get(entry.turnId) ?? 0)
                      }
                      clear={clear}
                    />
                  ))}
                </ul>

                {report !== null && last !== undefined && (
                  // Recedes with the group's last entry, not on its own footing.
                  // It closes that step, so it should sit at the same depth as
                  // the turns it is about rather than float clear of them.
                  <StepReport
                    visit={report}
                    fromEnd={
                      ledger.length - 1 - (positions.get(last.turnId) ?? 0)
                    }
                    clear={clear}
                  />
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface StepReportProps {
  visit: StepVisit;
  /** 0 is the newest entry in the ledger. Drives how far this one has receded. */
  fromEnd: number;
  /** Recession is off entirely — hovered, or scrolled back through the history. */
  clear: boolean;
}

/**
 * BIDARA's read on a step, at the foot of that step's entries.
 *
 * The same judgement the scorecard shows, from the same `verdictFor`, so a step
 * cannot come out one way here and another way at the end. The difference is
 * timing: this arrives while there is still something to do about it — the report
 * lands with the "move on?" prompt, so the strengths and gaps are on screen at the
 * moment the user decides whether to accept it or keep working.
 *
 * No entrance animation, matching the entries above it. It appears as the step
 * closes, which the new step's heading already announces.
 */
function StepReport({ visit, fromEnd, clear }: StepReportProps) {
  const assessment = visit.assessment;

  if (assessment === null) {
    return null;
  }

  const verdict = verdictFor(visit);
  const Icon = verdict.icon;

  // Same split as `Entry`: the rule stays on the outer element and the blur goes
  // on the content, or the spine holding the group together smears with it.
  const faded = clear ? { filter: "none", opacity: 1 } : recession(fromEnd);

  return (
    <div className="border-l border-border pl-3">
      <div
        style={faded}
        className="flex flex-col gap-y-1.5 py-2 transition-[filter,opacity] duration-300"
      >
        <span
          className={`flex items-center gap-x-1.5 text-[0.7rem] font-medium tracking-wide uppercase ${verdict.tone}`}
        >
          <Icon className="h-3 w-3 shrink-0" />
          {verdict.label}
        </span>

        <Points items={assessment.strengths} marker="+" tone="text-teal-700" />
        <Points items={assessment.gaps} marker="−" tone="text-secondary" />
      </div>
    </div>
  );
}

interface PointsProps {
  items: string[];
  /** Carries the strength/gap distinction without a heading for each list. */
  marker: string;
  tone: string;
}

function Points({ items, marker, tone }: PointsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-y-1">
      {items.map((item) => (
        <li
          key={item}
          className="flex gap-x-1.5 text-[0.75rem] leading-snug text-faded-dark"
        >
          <span className={`shrink-0 ${tone}`}>{marker}</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

interface EntryProps {
  entry: LedgerEntry;
  /** 0 is the newest entry. Drives how far this one has receded. */
  fromEnd: number;
  /** Recession is off entirely — hovered, or scrolled back through the history. */
  clear: boolean;
}

function Entry({ entry, fromEnd, clear }: EntryProps) {
  // Each entry owns its slice of the rule, so the speaker is readable from the
  // margin without the summary text having to say it.
  const bg = entry.speaker === "user" ? "bg-teal-950/4511" : "bg-transparent";

  const border = entry.speaker === "user" ? "border-teal-600" : "border-border";

  // Applied to the content, never to the `li`. Blurring the row would smear its
  // border, and that rule is the spine holding the step group together.
  const faded = clear ? { filter: "none", opacity: 1 } : recession(fromEnd);

  function handleClick(): void {
    const target = document.getElementById(entry.turnId);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (entry.summary === null) {
    return (
      <li className={`border-l py-1 pl-3 ${border}`}>
        <span
          style={faded}
          className={`block h-3 rounded transition-[filter,opacity] duration-300 ${
            entry.failed ? "w-24 bg-border" : "w-48 animate-pulse bg-border"
          }`}
        />
      </li>
    );
  }

  return (
    <li className={`border-l ${border} ${bg}`}>
      <button
        type="button"
        onClick={handleClick}
        style={faded}
        className="w-full cursor-pointer py-1 pl-3 text-left text-small text-faded-dark transition-[color,filter,opacity] duration-300 hover:text-text"
      >
        {entry.summary}
      </button>
    </li>
  );
}
