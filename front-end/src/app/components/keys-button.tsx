"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { KeyRound } from "lucide-react";

import { useKeys } from "@/lib/keys";
import KeyForm from "./key-form";

/**
 * Reopens the key form so the key can be swapped or removed later.
 *
 * Labelled rather than icon-only. This is the one control in the app that has no
 * second way to reach it — miss it and the key is unchangeable short of deleting
 * the app's data — so it says what it is.
 *
 * Placement and visibility belong to the caller: it is shown on the opening
 * screen, where the column has room for it, and leaves once a conversation
 * starts.
 *
 * Absent in the browser build, where there is no keychain and the key belongs to
 * the server.
 */
export default function KeysButton() {
  const { managed } = useKeys();
  const [open, setOpen] = useState(false);

  function handleOpen(): void {
    setOpen(true);
  }

  function handleClose(): void {
    setOpen(false);
  }

  if (!managed) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Change your API key"
        className="flex h-9 cursor-pointer items-center gap-x-1.5 rounded-lg border border-border px-3 text-text2 transition-colors duration-300 hover:border-teal-800 hover:text-text"
      >
        <KeyRound className="h-4 w-4" />
        <span className="text-small">Keys</span>
      </button>

      {/* Portalled to the body: this button sits in a stacking context of its
          own, which would otherwise trap the overlay beneath the columns. Only
          reachable after a click, so `document` is always there. */}
      {createPortal(
        <AnimatePresence>
          {open && <KeyForm onClose={handleClose} />}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
