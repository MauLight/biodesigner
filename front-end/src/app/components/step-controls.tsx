"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";

import { useSession, FORCE_ADVANCE_PHRASE } from "@/lib/session";
import { nextStep } from "@/lib/steps";

interface StepControlsProps {
  /** Narrates a message in the composer and sends it a moment later. */
  onQueue: (text: string, notice: string) => void;
  /** A message is already queued, so don't offer the same action again. */
  suppressed: boolean;
}

/**
 * Sits under the composer and handles moving between design steps.
 *
 * Two states, never both at once. When BIDARA reports a step satisfied, the user
 * chooses whether to move on. Otherwise, once a step has taken a few turns, the
 * escape hint appears — testing showed BIDARA keeps finding legitimate gaps
 * almost indefinitely, so forcing the move is the normal way forward, not a
 * failure case.
 *
 * Both paths queue their message rather than sending immediately: the composer
 * narrates what is about to happen and typing cancels it. Clicking either control
 * is the decision, so neither waits for a second confirmation.
 */
export default function StepControls({
  onQueue,
  suppressed,
}: StepControlsProps) {
  const {
    currentStep,
    awaitingStepDecision,
    canForceAdvance,
    declineAdvance,
    acceptAdvance,
  } = useSession();

  const next = nextStep(currentStep);

  function handleAccept(): void {
    if (next === null) {
      return;
    }

    acceptAdvance();
    onQueue(
      `Let's move on to ${next}.`,
      `Moving on to ${next} — type here to cancel`,
    );
  }

  /**
   * Queues the escape phrase. The step change happens in `submit`, which
   * recognises the phrase — so typing it by hand works identically.
   */
  function handleForce(): void {
    if (next === null) {
      return;
    }

    onQueue(FORCE_ADVANCE_PHRASE, `Moving on to ${next} — type here to cancel`);
  }

  const showDecision = !suppressed && awaitingStepDecision && next !== null;
  const showHint =
    !suppressed && !showDecision && canForceAdvance && next !== null;

  return (
    <AnimatePresence mode="wait">
      {showDecision && (
        <motion.div
          key="decision"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 text-small"
        >
          <span className="text-text2">
            {currentStep} looks covered. Move on to {next}?
          </span>
          <button
            type="button"
            onClick={handleAccept}
            className="flex cursor-pointer items-center gap-x-1 rounded-md bg-teal-700 px-3 py-1 text-text transition-opacity duration-300 hover:opacity-90"
          >
            Move on
            <ArrowRight className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={declineAdvance}
            className="cursor-pointer rounded-md px-3 py-1 text-faded-dark transition-colors duration-300 hover:text-text2"
          >
            Keep working on {currentStep}
          </button>
        </motion.div>
      )}

      {showHint && (
        <motion.button
          key="hint"
          type="button"
          onClick={handleForce}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="w-fit cursor-pointer text-left text-small text-faded-dark underline decoration-dotted underline-offset-4 transition-colors duration-300 hover:text-text2"
        >
          Stuck on {currentStep}? Move to {next} anyway
        </motion.button>
      )}
    </AnimatePresence>
  );
}
