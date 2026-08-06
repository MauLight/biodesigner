"use client";

import { useEffect, useRef, useState } from "react";

import { useSession } from "@/lib/session";
import type { LedgerEntry } from "@/lib/session";
import type { DesignStep } from "@/lib/steps";
import { Pointer } from "lucide-react";

/** How close to the bottom still counts as "following along", in pixels. */
const PINNED_THRESHOLD = 60;

/** Entries at the end left untouched. Everything older recedes. */
const CLEAR_ENTRIES = 3;

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
  step: DesignStep;
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
  const { ledger } = useSession();
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

  function handlePointerEnter(): void {
    setRevealed(true);
  }

  function handlePointerLeave(): void {
    setRevealed(false);
  }

  function handleScroll(): void {
    const element = containerRef.current;

    if (element === null) {
      return;
    }

    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    pinnedRef.current = distance < PINNED_THRESHOLD;
  }

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
      pinnedRef.current = true;
    }

    if (pinnedRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [ledger]);

  if (ledger.length === 0) {
    return <div className="min-h-0 flex-1" />;
  }

  const groups = groupByStep(ledger);

  // Position in the whole ledger, not within a group — recession is measured
  // against the newest turn, and groups are just how the list is divided up.
  const positions = new Map(
    ledger.map((entry, index) => [entry.turnId, index]),
  );

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
        style={{ opacity: revealed ? 0 : 1 }}
        className="pointer-events-none absolute flex flex-col justify-center items-center gap-y-1.5 inset-x-0 top-0 z-10 h-102 bg-linear-to-b from-black via-black/80 to-transparent transition-opacity duration-300 text-[#494949]"
      >
        <Pointer className="w-7 h-7 text-[#393939]" />
        <p className="text-small font-medium">Hover to reveal</p>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div className="mt-auto flex flex-col gap-y-4 pb-6">
          {groups.map((group, index) => (
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
                    revealed={revealed}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

interface EntryProps {
  entry: LedgerEntry;
  /** 0 is the newest entry. Drives how far this one has receded. */
  fromEnd: number;
  /** The pointer is over the ledger — everything is legible again. */
  revealed: boolean;
}

function Entry({ entry, fromEnd, revealed }: EntryProps) {
  // Each entry owns its slice of the rule, so the speaker is readable from the
  // margin without the summary text having to say it.
  const bg = entry.speaker === "user" ? "bg-teal-950/4511" : "bg-transparent";

  const border = entry.speaker === "user" ? "border-teal-600" : "border-border";

  // Applied to the content, never to the `li`. Blurring the row would smear its
  // border, and that rule is the spine holding the step group together.
  const faded = revealed ? { filter: "none", opacity: 1 } : recession(fromEnd);

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
