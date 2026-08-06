"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ClipboardList, Info, MessageCircleMore } from "lucide-react";

import Message from "./message";
import Scorecard from "./scorecard";
import { useSession } from "@/lib/session";
import { isDesignStep } from "@/lib/steps";
import BidaraStepsAnimation from "./bidara-steps-animation";

/** How close to the bottom still counts as "following along", in pixels. */
const PINNED_THRESHOLD = 80;

/** What is covering the transcript. `null` is the transcript itself. */
type Overlay = "steps" | "scorecard" | null;

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
 * overlay and the floating controls measure from the true pane edges — the
 * overlay reaches them, and the controls sit over the gutter instead of inside it.
 *
 * Two controls, not one that cycles: the scorecard gets its own button once the
 * challenge is closed. A single cycling control had to label itself with where
 * the *next* press would land, which is not what is on screen, and with three
 * stops that was never legible.
 */
export default function Generation() {
  const { turns, currentStep, finished, sessionId } = useSession();
  /** Which panel covers the transcript, if any. `null` is the transcript. */
  const [overlay, setOverlay] = useState<Overlay>(null);
  /** The scorecard button explains itself until it has been used once. */
  const [scorecardHintSeen, setScorecardHintSeen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const turnCountRef = useRef(0);
  const seenTurnsRef = useRef(0);
  const reduceMotion = useReducedMotion();

  const started = turns.length > 0;

  /**
   * Panel state belongs to a session, but this component outlives one — closing
   * from the scorecard does not unmount it. Without this the next session would
   * open with a stale scorecard queued over its first reply, and its own
   * scorecard button would arrive with the hint already dismissed.
   */
  const [lastSession, setLastSession] = useState(sessionId);

  if (lastSession !== sessionId) {
    setLastSession(sessionId);
    setOverlay(null);
    setScorecardHintSeen(false);
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

  /**
   * One control per destination rather than one that cycles.
   *
   * Cycling meant the label and icon had to describe where the *next* press
   * would go, which is a different thing from what is on screen — and with three
   * stops it was never obvious which one that was.
   *
   * This one opens the process, or returns to the conversation from whichever
   * panel is up. So from the scorecard it is one press back to the transcript,
   * not two.
   */
  function handleToggleSteps(): void {
    setOverlay(function next(current: Overlay): Overlay {
      return current === null ? "steps" : null;
    });
  }

  function handleShowScorecard(): void {
    setScorecardHintSeen(true);
    setOverlay("scorecard");
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

  /** The scorecard has never been opened, so the button is still explaining itself. */
  const hinting = finished && !scorecardHintSeen && overlay !== "scorecard";

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

      {/* One backdrop, keyed to itself rather than to `overlay`, so swapping
          panels changes the contents without remounting the layer. Keying it to
          `overlay` fades the whole thing out and back in, and the transcript
          shows through the gap. */}
      <AnimatePresence>
        {overlay !== null && (
          <motion.div
            key="panel"
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
      <div className="absolute right-6 bottom-6 z-30 flex items-center gap-x-3">
        {finished && (
          <div className="relative">
            <AnimatePresence>
              {hinting && (
                // A button, not a label. It sits where the pointer already is and
                // reads as the thing to press; `pointer-events-none` made it a
                // target that swallowed nothing and did nothing.
                <motion.button
                  key="hint"
                  type="button"
                  onClick={handleShowScorecard}
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={fade}
                  className="absolute top-1/2 right-full mr-2 -translate-y-1/2 cursor-pointer rounded-full border border-teal-500 bg-[#001214] px-3 py-1.5 text-small whitespace-nowrap text-text2 transition-colors duration-300 hover:text-text"
                >
                  Click to see a summary of your progress
                </motion.button>
              )}
            </AnimatePresence>

            {/* Held in its hover state while the bubble is up, so the two read as
                one control rather than a label next to a dormant button. */}
            <button
              type="button"
              onClick={handleShowScorecard}
              disabled={overlay === "scorecard"}
              aria-label="Show the scorecard"
              className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border bg-background transition-colors duration-300 hover:border-teal-800 hover:text-text disabled:cursor-default disabled:border-border disabled:text-[#2a2a2a] disabled:hover:text-[#2a2a2a] ${
                hinting ? "border-teal-800 text-text" : "border-border text-faded-dark"
              }`}
            >
              <ClipboardList className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* No `AnimatePresence` on the icon. Waiting out an exit animation left
            it naming the previous view for a quarter second after the panel had
            already changed, which read as the button being out of sync. */}
        <button
          type="button"
          onClick={handleToggleSteps}
          aria-label={
            overlay === null
              ? "Show the design process"
              : "Back to the conversation"
          }
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-faded-dark transition-colors duration-300 hover:border-teal-800 hover:text-text"
        >
          {overlay === null ? (
            <Info className="h-5 w-5" />
          ) : (
            <MessageCircleMore className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}
