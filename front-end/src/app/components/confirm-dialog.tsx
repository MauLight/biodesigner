"use client";

import { useEffect } from "react";
import { motion } from "motion/react";

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  /** Set while the action is running, so it can't be fired twice. */
  busy?: boolean;
  /** Shown in place of dismissing, so a failure doesn't look like a success. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A blocking yes/no for something that can't be undone.
 *
 * Sits at `z-[60]`, above the modals at `z-50`, because the thing being confirmed
 * is always reached from inside one of them. Its own backdrop swallows clicks meant
 * for the layer underneath, so there is no way to act on the list behind it while
 * the question is open.
 */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [busy, onCancel]);

  function handleBackdrop(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget && !busy) {
      onCancel();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={handleBackdrop}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-8 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-md flex-col gap-y-5 rounded-2xl border border-[#202020] bg-linear-to-b from-[#0d0d0d] to-box-dark p-8">
        <div className="flex flex-col gap-y-2">
          <h2 className="text-[1.2rem] font-medium text-text">{title}</h2>
          <p className="text-small text-faded-dark">{body}</p>
        </div>

        {error !== null && <p className="text-small text-error">{error}</p>}

        <div className="flex items-center gap-x-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="cursor-pointer rounded-md bg-error px-4 py-2 text-text transition-opacity duration-300 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Deleting…" : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="cursor-pointer rounded-md px-3 py-2 text-small text-faded-dark transition-colors duration-300 hover:text-text2 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}
