"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { House } from "lucide-react";

import StepProgress from "./step-progress";
import { useSession } from "@/lib/session";

/**
 * The session header: the project name on the left, progress through the process
 * on the right, sharing one reveal.
 *
 * An input rather than a heading, and styled to hide that fact: no border, no
 * background, no focus ring. It should read as the title until you click it.
 *
 * It appears only after the first reply of the second step has finished — the
 * point where the project has enough shape to deserve a name, and late enough
 * that it doesn't compete with the transition for attention. Once shown it stays,
 * including for users who skipped the naming modal, so renaming is always
 * reachable. An unnamed session shows its dated placeholder, dimmed to read as a
 * default rather than a choice.
 *
 * `shrink-0` matters: this is a sibling of the ledger, which is `flex-1
 * min-h-0`. The ledger gives up the height, so entries scrolling upward are
 * clipped at its own top edge and never ride over the title.
 */
export default function SessionTitle() {
  const { title, named, rename, close, stepHistory, stepTurnCount, status } =
    useSession();
  const [draft, setDraft] = useState(title);
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  const ready =
    stepHistory.length > 1 && stepTurnCount >= 1 && status !== "streaming";

  // A latch, adjusted during render rather than in an effect. Effects run after
  // the commit, so the reveal would always be one paint late — and it is the
  // cascading render `react-hooks/set-state-in-effect` warns about.
  if (ready && !revealed) {
    setRevealed(true);
  }

  // Follows the session when the title changes elsewhere — the naming modal, or a
  // session loaded from disk. Compared against the last title seen rather than
  // synced in an effect, so a keystroke isn't briefly overwritten by the old
  // value on its way through.
  const [lastTitle, setLastTitle] = useState(title);

  if (lastTitle !== title) {
    setLastTitle(title);
    setDraft(title);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setDraft(event.target.value);
  }

  function handleBlur(): void {
    if (draft !== title) {
      rename(draft);
    }
  }

  async function handleGoHome(): Promise<void> {
    await close();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      inputRef.current?.blur();
      return;
    }

    // Abandon the edit rather than committing a half-typed name.
    if (event.key === "Escape") {
      setDraft(title);
      inputRef.current?.blur();
    }
  }

  return (
    <div className="mt-2 flex shrink-0 items-center gap-4 pb-4">
      {/* Always present, unlike the title. It is the only way back to the main
          screen, so gating it behind the reveal would strand anyone still in the
          first step. It saves on the way out, and since nothing is discarded there
          is nothing to confirm. */}
      <button
        type="button"
        onClick={handleGoHome}
        aria-label="Save and return to the main screen"
        className="shrink-0 cursor-pointer text-faded-dark transition-colors duration-300 hover:text-text"
      >
        <House className="h-5 w-5 text-teal-500" />
      </button>

      {/* `flex-1` rather than `w-1/2`, so the two halves stay equal with the gap
          between them instead of overflowing by its width. The spacer holds the
          column steady until the title has earned its place. */}
      <AnimatePresence initial={false} mode="wait">
        {revealed ? (
          <motion.input
            key="title"
            ref={inputRef}
            type="text"
            value={draft}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            aria-label="Project title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.5 }}
            className={`min-w-0 flex-1 border-none bg-transparent p-0 text-[1.1rem] font-medium focus:outline-none ${
              named ? "text-text" : "text-faded-dark"
            }`}
          />
        ) : (
          <div key="spacer" className="flex-1" />
        )}
      </AnimatePresence>

      <div className="flex flex-1 justify-end">
        <StepProgress />
      </div>
    </div>
  );
}
