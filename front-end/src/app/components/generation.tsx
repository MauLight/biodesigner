"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ClipboardList, Info, MessageCircleMore } from "lucide-react";

import Message from "./message";
import Scorecard from "./scorecard";
import { useSession } from "@/lib/session";
import { FINISH_STEP, isDesignStep } from "@/lib/steps";
import BidaraStepsAnimation from "./bidara-steps-animation";

/** How close to the bottom still counts as "following along", in pixels. */
const PINNED_THRESHOLD = 80;

/** What is covering the transcript. `null` is the transcript itself. */
type Overlay = "steps" | "scorecard" | null;

/** Describes where the control goes next, which is what it is labelled with. */
function nextLabel(overlay: Overlay, finished: boolean): string {
  if (overlay === null) {
    return "Show the design process";
  }

  return overlay === "steps" && finished
    ? "Show the scorecard"
    : "Back to the conversation";
}

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
  const { turns, currentStep, finished } = useSession();
  /**
   * Which panel covers the transcript, if any.
   *
   * `scorecard` only exists once the challenge is closed, so the control is a
   * two-way swap during a session and a three-way cycle after it.
   */
  const [overlay, setOverlay] = useState<Overlay>(null);
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

  function handleCycleOverlay(): void {
    setOverlay(function next(current: Overlay): Overlay {
      if (current === null) {
        return "steps";
      }

      // Back to the conversation, unless there is a scorecard to visit first.
      return current === "steps" && finished ? "scorecard" : null;
    });
  }

  // Sending a message returns you to the conversation. The composer stays usable
  // with the panel open, so without this a reply would stream out of sight.
  //
  // Tracked on its own ref: the scroll effect below bails out early in cases this
  // one must still run, so they cannot share a counter.
  useEffect(() => {
    if (turns.length > seenTurnsRef.current) {
      setOverlay(null);
    }

    seenTurnsRef.current = turns.length;
  }, [turns]);

  /**
   * The closing remark has arrived and settled.
   *
   * Not `finished` alone: the step becomes Finish the moment the transition is
   * accepted, which is up to `AUTO_SEND_DELAY_MS` before the request is even
   * sent. Opening the scorecard then would hide the closing remark behind it.
   */
  const closingDelivered =
    finished &&
    turns.some(
      (turn) =>
        turn.role === "assistant" &&
        turn.step === FINISH_STEP &&
        !turn.streaming,
    );

  /**
   * Opens the scorecard once, adjusted during render rather than in an effect.
   *
   * There is no race with the effect that clears the overlay on a new turn: that
   * one keys off `turns.length`, which grew when the reply *started*. This fires
   * on the later render where the same turn stops streaming, so the clear has
   * already happened and is not repeated.
   */
  const [closingShown, setClosingShown] = useState(false);

  if (closingDelivered && !closingShown) {
    setClosingShown(true);
    setOverlay("scorecard");
  }

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

      {/* `mode="wait"` so one panel finishes fading before the next begins —
          cross-fading two opaque layers over the transcript shows it through the
          gap between them. */}
      <AnimatePresence mode="wait">
        {overlay !== null && (
          <motion.div
            key={overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            className="absolute inset-0 z-20 bg-background"
          >
            {overlay === "steps" ? (
              // Only a design step can be highlighted — there is no Finish card,
              // and passing it would light nothing while looking like a bug.
              <BidaraStepsAnimation
                highlight={isDesignStep(currentStep) ? currentStep : undefined}
              />
            ) : (
              <Scorecard />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unconditional: the early return above means a transcript exists. */}
      <button
        type="button"
        onClick={handleCycleOverlay}
        aria-label={nextLabel(overlay, finished)}
        className="absolute right-6 bottom-6 z-30 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-faded-dark transition-colors duration-300 hover:border-teal-800 hover:text-text"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={overlay ?? "chat"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            className="flex items-center justify-center"
          >
            {/* The icon names where the button goes, not where you are. */}
            {overlay === null ? (
              <Info className="h-5 w-5" />
            ) : overlay === "steps" && finished ? (
              <ClipboardList className="h-5 w-5" />
            ) : (
              <MessageCircleMore className="h-5 w-5" />
            )}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  );
}
