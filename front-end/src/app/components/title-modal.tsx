"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";

interface TitleModalProps {
  /**
   * Called once the user is done, either way. The caller resumes whatever it was
   * about to do — so this must fire on save *and* on skip, or the conversation
   * stalls here.
   */
  onClose: () => void;
  /** Commits the name. Not called when the user skips. */
  onSave: (title: string) => void;
}

/**
 * Asks the user to name the project, at the moment the first step closes.
 *
 * It blocks: nothing else happens until it is dismissed. That is deliberate — the
 * step transition and the reply that follows are the app's biggest state change,
 * and stopping here means the user watches it happen instead of scrolling back to
 * find out what did.
 *
 * Skipping is a real option, not a nag. The title can be edited from the header
 * for the rest of the session.
 */
export default function TitleModal({ onClose, onSave }: TitleModalProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function commit(): void {
    const trimmed = value.trim();

    if (trimmed !== "") {
      onSave(trimmed);
    }

    onClose();
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    commit();
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setValue(event.target.value);
  }

  // Escape reads as "get out of my way", which is the skip, not a cancel that
  // could leave the transition half-done.
  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const fade = { duration: reduceMotion ? 0 : 0.25 };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={fade}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...fade, delay: reduceMotion ? 0 : 0.05 }}
        className="w-full max-w-md px-6"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-5">
          <div className="flex flex-col gap-y-1">
            <h2 className="text-[1.4rem] font-medium text-text">
              Name this project
            </h2>
            <p className="text-small text-faded-dark">
              Something you&rsquo;ll recognise later. Skip and it keeps its
              dated name — either way you can change it at any time from the
              header.
            </p>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            placeholder="Passive cooling for transit shelters"
            className="w-full rounded-md border border-border bg-transparent px-4 py-3 text-text placeholder:text-faded-dark focus:border-teal-600 focus:outline-none"
          />

          <div className="flex items-center gap-x-3">
            <button
              type="submit"
              disabled={value.trim() === ""}
              className="flex cursor-pointer items-center gap-x-1 rounded-md bg-teal-700 px-4 py-2 text-text transition-opacity duration-300 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Name it
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md px-3 py-2 text-small text-faded-dark transition-colors duration-300 hover:text-text2"
            >
              Skip for now
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
