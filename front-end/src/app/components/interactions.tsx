"use client";

import { useEffect, useRef } from "react";

import { useSession } from "@/lib/session";
import type { LedgerEntry } from "@/lib/session";
import type { DesignStep } from "@/lib/steps";

/** How close to the bottom still counts as "following along", in pixels. */
const PINNED_THRESHOLD = 60;

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

  return (
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
                coloured by speaker. Adjacent borders butt together, so the group
                still reads as one continuous line. */}
            <ul className="flex flex-col">
              {group.entries.map((entry) => (
                <Entry key={entry.turnId} entry={entry} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Entry({ entry }: { entry: LedgerEntry }) {
  // Each entry owns its slice of the rule, so the speaker is readable from the
  // margin without the summary text having to say it.
  const bg = entry.speaker === "user" ? "bg-teal-950/4511" : "bg-transparent";

  const border = entry.speaker === "user" ? "border-teal-600" : "border-border";

  function handleClick(): void {
    const target = document.getElementById(entry.turnId);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (entry.summary === null) {
    return (
      <li className={`border-l py-1 pl-3 ${border}`}>
        <span
          className={`block h-3 rounded ${
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
        className="w-full cursor-pointer py-1 pl-3 text-left text-small text-faded-dark transition-colors duration-200 hover:text-text"
      >
        {entry.summary}
      </button>
    </li>
  );
}
