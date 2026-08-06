"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Info, MessageCircleMore } from "lucide-react";

import Message from "./message";
import { useSession } from "@/lib/session";
import { isDesignStep } from "@/lib/steps";
import BidaraStepsAnimation from "./bidara-steps-animation";

/** How close to the bottom still counts as "following along", in pixels. */
const PINNED_THRESHOLD = 80;

/**
 * The right-hand pane: the conversation, and the process reference over it.
 *
 * Auto-scroll respects the reader while a reply streams — tokens arrive
 * constantly, and scrolling unconditionally would yank the view down the moment
 * someone scrolled up to re-read something.
 *
 * But a *new turn* re-pins regardless of where the reader was. Scrolling up to
 * read a long reply is exactly what you do before answering it, and having the
 * view then ignore your own next message reads as broken.
 *
 * The step reference renders two different ways, and the difference is not
 * cosmetic. Before the first turn it *is* the pane — returned outright, so the
 * switch to the conversation is instant and the first message's entrance animation
 * plays against nothing. Reopened later it is an opaque overlay, which keeps the
 * transcript mounted and its scroll position intact; a swap would remount the
 * scroll container and drop you at the top of the conversation.
 *
 * The column's gutter lives on the transcript, not on the wrapper, so both the
 * overlay and the floating toggle measure from the true pane edges — the overlay
 * reaches them, and the toggle sits over the gutter instead of inside it.
 */
export default function Generation() {
  const { turns, currentStep } = useSession();
  const [stepsOpen, setStepsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const turnCountRef = useRef(0);
  const seenTurnsRef = useRef(0);
  const reduceMotion = useReducedMotion();

  const started = turns.length > 0;

  function handleScroll(): void {
    const element = containerRef.current;

    if (element === null) {
      return;
    }

    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    pinnedRef.current = distance < PINNED_THRESHOLD;
  }

  function handleToggleSteps(): void {
    setStepsOpen(function toggle(open: boolean): boolean {
      return !open;
    });
  }

  // Sending a message returns you to the conversation. The composer stays usable
  // with the panel open, so without this a reply would stream out of sight.
  //
  // Tracked on its own ref: the scroll effect below bails out early in cases this
  // one must still run, so they cannot share a counter.
  useEffect(() => {
    if (turns.length > seenTurnsRef.current) {
      setStepsOpen(false);
    }

    seenTurnsRef.current = turns.length;
  }, [turns]);

  useEffect(() => {
    const element = containerRef.current;

    if (element === null) {
      return;
    }

    const isNewTurn = turns.length > turnCountRef.current;
    turnCountRef.current = turns.length;

    if (isNewTurn) {
      pinnedRef.current = true;
    }

    if (pinnedRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [turns]);

  const fade = { duration: reduceMotion === true ? 0 : 0.25 };

  // No transcript to sit behind, and nothing to animate away from: this is the
  // pane, and the switch to the conversation should be immediate.
  if (!started) {
    return <BidaraStepsAnimation />;
  }

  return (
    <div className="relative z-10 h-full w-full">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="scrollbar-hide flex h-full w-full flex-col gap-6 overflow-y-auto px-20 py-10"
      >
        {turns.map((turn) => (
          <Message key={turn.id} turn={turn} />
        ))}
      </div>

      <AnimatePresence>
        {stepsOpen && (
          <motion.div
            key="steps"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            className="absolute inset-0 z-20 bg-background"
          >
            {/* Only a design step can be highlighted — there is no Finish card,
                and passing it would light nothing while looking like a bug. */}
            <BidaraStepsAnimation
              highlight={isDesignStep(currentStep) ? currentStep : undefined}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unconditional: the early return above means a transcript exists. */}
      <button
        type="button"
        onClick={handleToggleSteps}
        aria-label={
          stepsOpen ? "Back to the conversation" : "Show the design process"
        }
        className="absolute right-6 bottom-6 z-30 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-faded-dark transition-colors duration-300 hover:border-teal-800 hover:text-text"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={stepsOpen ? "chat" : "info"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            className="flex items-center justify-center"
          >
            {stepsOpen ? (
              <MessageCircleMore className="h-5 w-5" />
            ) : (
              <Info className="h-5 w-5" />
            )}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  );
}
