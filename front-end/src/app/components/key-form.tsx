"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, KeyRound, Trash2 } from "lucide-react";

import { useKeys } from "@/lib/keys";

interface KeyFormProps {
  /**
   * Dismisses the form. Absent on first run, where there is nothing behind it to
   * go back to — that is what makes the same component a gate and a settings
   * panel without a mode flag.
   */
  onClose?: () => void;
}

/**
 * Collects the user's OpenAI key.
 *
 * Full screen on first run, and the same form again later from the key button.
 * Built on `TitleModal`'s shape deliberately: these are the app's only two modal
 * interruptions, and one of them appearing in a different visual language would
 * read as a different application.
 *
 * The field is a password input and the value is never read back — once saved,
 * the key lives in the OS keychain and even this form starts empty. There is no
 * "show current key", because the renderer is not given one.
 */
export default function KeyForm({ onClose }: KeyFormProps) {
  const { stored, save, clear } = useKeys();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  /** Storage can genuinely refuse — say so rather than failing silently. */
  const [failure, setFailure] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  const valid = value.trim() !== "";
  const busy = saving || clearing;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape only closes when there is something to close to. On first run it must
  // not dismiss, or the user lands on an app that cannot make a single request.
  useEffect(() => {
    if (onClose === undefined) {
      return;
    }

    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setValue(event.target.value);
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    if (!valid || busy) {
      return;
    }

    setSaving(true);
    setFailure("");

    try {
      await save(value.trim());
      onClose?.();
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "The key could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleClear(): Promise<void> {
    if (busy) {
      return;
    }

    setClearing(true);
    setFailure("");

    try {
      await clear();
      setValue("");
      onClose?.();
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "The key could not be removed.",
      );
    } finally {
      setClearing(false);
    }
  }

  const fade = { duration: reduceMotion === true ? 0 : 0.25 };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={fade}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: reduceMotion === true ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...fade, delay: reduceMotion === true ? 0 : 0.05 }}
        className="w-full max-w-md px-6"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-5">
          <div className="flex flex-col gap-y-1">
            <div className="flex items-center gap-x-2">
              <KeyRound className="h-5 w-5 text-teal-600" />
              <h2 className="text-[1.4rem] font-medium text-text">
                {stored ? "Change your API key" : "Add your OpenAI API key"}
              </h2>
            </div>
            <p className="text-small text-faded-dark">
              Kept in this device&rsquo;s secure storage and used only for your
              own requests. It never leaves the machine except to OpenAI, and
              neither do your designs.
            </p>
          </div>

          <input
            ref={inputRef}
            type="password"
            value={value}
            onChange={handleChange}
            placeholder="sk-..."
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-md border border-border bg-transparent px-4 py-3 font-mono text-small text-text placeholder:text-faded-dark focus:border-teal-600 focus:outline-none"
          />

          {failure !== "" && (
            <p role="alert" className="text-small text-error">
              {failure}
            </p>
          )}

          <div className="flex items-center gap-x-3">
            <button
              type="submit"
              disabled={!valid || busy}
              className="flex cursor-pointer items-center gap-x-1 rounded-md bg-teal-700 px-4 py-2 text-text transition-opacity duration-300 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Saving" : stored ? "Replace it" : "Save and continue"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>

            {onClose !== undefined && (
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-md px-3 py-2 text-small text-faded-dark transition-colors duration-300 hover:text-text2"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Only once something is stored — there is nothing to forget
              otherwise, and on first run it would offer to undo a state the user
              is currently stuck in. */}
          {stored && (
            <div className="flex flex-col gap-y-1 border-t border-border pt-4">
              <button
                type="button"
                onClick={handleClear}
                disabled={busy}
                className="flex w-fit cursor-pointer items-center gap-x-1.5 text-small text-faded-dark transition-colors duration-300 hover:text-error disabled:cursor-default disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {clearing ? "Forgetting" : "Forget this key"}
              </button>
              <p className="text-small text-[#595959]">
                Removes it from this device and returns to setup. Your saved
                sessions stay where they are.
              </p>
            </div>
          )}
        </form>
      </motion.div>
    </motion.div>
  );
}
