"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";

import ProjectsList from "./projects-list";
import type { SessionSummary } from "@/lib/api";

interface ProjectsModalProps {
  /** Newest first, as the listing returns them. */
  sessions: SessionSummary[];
  onClose: () => void;
  /** Reports a deletion so the caller can drop it from the listing it owns. */
  onDeleted: (id: string) => void;
}

/**
 * Every saved session, where the trees show only the last three.
 *
 * A frame around `ProjectsList` and nothing more — the rows, the scrollbar and the
 * delete confirmation are the same ones the column renders inline at narrow
 * widths.
 */
export default function ProjectsModal({
  sessions,
  onClose,
  onDeleted,
}: ProjectsModalProps) {
  /** A confirmation is up, so Escape belongs to it. */
  const [confirming, setConfirming] = useState(false);

  // Stands down while the confirmation is up, or one Escape would dismiss both
  // layers and the question would look like it had been answered.
  useEffect(() => {
    if (confirming) {
      return;
    }

    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose, confirming]);

  /** Only a click on the backdrop itself, not one that bubbled from the panel. */
  function handleBackdrop(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8 backdrop-blur-sm"
    >
      <div className="flex max-h-[80vh] w-200 max-w-full flex-col gap-y-8 rounded-[25px] border border-[#202020] bg-linear-to-b from-[#0d0d0d] to-box-dark p-20">
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="text-[1.2rem] font-medium text-text border-b">
            Previous sessions
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer text-faded-dark transition-colors duration-300 hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* The panel's padding is what gives the list's scrollbar its `-right-4`
            somewhere to sit. */}
        <ProjectsList
          sessions={sessions}
          onDeleted={onDeleted}
          onOpened={onClose}
          onConfirming={setConfirming}
        />
      </div>
    </motion.div>
  );
}
