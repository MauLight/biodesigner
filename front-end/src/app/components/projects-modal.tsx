"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Trash2, X } from "lucide-react";

import ConfirmDialog from "./confirm-dialog";
import CustomScrollbar from "./custom-scrollbar";
import { deleteSession } from "@/lib/api";
import type { SessionSummary } from "@/lib/api";
import { countCompletedSteps, useSession } from "@/lib/session";
import { DESIGN_STEPS } from "@/lib/steps";
import { lastTouched } from "@/lib/time";

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
 * Same three facts per row as a tree — title, progress, last touched — laid out as
 * a list rather than a shape, because the point here is scanning a long set rather
 * than glancing at the recent one. Newest first: the trees read left-to-right as a
 * timeline, but a list reads top-down as a ranking.
 */
export default function ProjectsModal({
  sessions,
  onClose,
  onDeleted,
}: ProjectsModalProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SessionSummary | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // The scrollbar only appears when there is something to scroll. Re-measured on
  // resize, since the panel is capped at a share of the viewport rather than a
  // fixed height — the same list overflows or doesn't depending on the window.
  useEffect(() => {
    const element = listRef.current;

    if (element === null) {
      return;
    }

    // Re-read rather than closing over `element`: a function declaration is
    // hoisted above the null check, so the narrowing doesn't reach it.
    function measure(): void {
      const list = listRef.current;

      if (list === null) {
        return;
      }

      // A pixel of slack: sub-pixel layout rounding otherwise reports overflow on
      // a list that fits exactly.
      setOverflows(list.scrollHeight > list.clientHeight + 1);
    }

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [sessions.length]);

  // Stands down while the confirmation is up, or one Escape would dismiss both
  // layers and the question would look like it had been answered.
  useEffect(() => {
    if (pendingDelete !== null) {
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
  }, [onClose, pendingDelete]);

  /** Only a click on the backdrop itself, not one that bubbled from the panel. */
  function handleBackdrop(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleRequestDelete(session: SessionSummary): void {
    setDeleteError(null);
    setPendingDelete(session);
  }

  function handleCancelDelete(): void {
    setPendingDelete(null);
    setDeleteError(null);
  }

  async function handleConfirmDelete(): Promise<void> {
    if (pendingDelete === null) {
      return;
    }

    setDeleting(true);

    try {
      await deleteSession(pendingDelete.id);
      // Told, not refetched: the caller owns the listing and a second round trip
      // could disagree with what was just removed.
      onDeleted(pendingDelete.id);
      setPendingDelete(null);
    } catch {
      // Kept open on failure, so a file that is still there doesn't vanish from
      // the list as though it were gone.
      setDeleteError("That session could not be deleted.");
    } finally {
      setDeleting(false);
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

        {/* `relative` is what the scrollbar positions against, and the panel's
            padding is what gives its `-right-4` somewhere to sit. */}
        <div className="relative flex min-h-0 flex-col">
          <ul
            ref={listRef}
            className="scrollbar-hide flex min-h-0 flex-col gap-y-2 overflow-y-auto"
          >
            {sessions.map((session) => (
              <Row
                key={session.id}
                session={session}
                onOpened={onClose}
                onRequestDelete={handleRequestDelete}
              />
            ))}
          </ul>

          {overflows && <CustomScrollbar scrollRef={listRef} />}
        </div>
      </div>

      <AnimatePresence>
        {pendingDelete !== null && (
          <ConfirmDialog
            key="confirm-delete"
            title="Delete this session?"
            body={`"${pendingDelete.title ?? "Untitled session"}" and its whole transcript will be removed from disk. This cannot be undone.`}
            confirmLabel="Delete"
            busy={deleting}
            error={deleteError}
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface RowProps {
  session: SessionSummary;
  /** Called once the session is open, so the modal gets out of the way. */
  onOpened: () => void;
  /** Asks for confirmation. Nothing is deleted from here. */
  onRequestDelete: (session: SessionSummary) => void;
}

function Row({ session, onOpened, onRequestDelete }: RowProps) {
  const { load } = useSession();
  const completed = countCompletedSteps(session.stepHistory);
  const touched = lastTouched(session.updatedAt);

  async function handleOpen(): Promise<void> {
    // Left open on failure: `load` puts the reason in the session error, and
    // closing would hide it behind the empty state.
    if (await load(session.id)) {
      onOpened();
    }
  }

  function handleDelete(): void {
    onRequestDelete(session);
  }

  // The two controls are siblings rather than nested: a button inside a button is
  // invalid, and clicking the bin would otherwise also open the session. The
  // hover styling moves up to the row so it still reads as one target.
  return (
    <li className="group flex items-center gap-2 rounded-lg border border-transparent pr-2 transition-colors duration-300 hover:border-teal-950 hover:bg-[#001214]">
      <button
        type="button"
        onClick={handleOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 px-4 py-3 text-left"
      >
        <span
          className={`min-w-0 flex-1 truncate font-medium ${
            session.named ? "text-text" : "text-faded-dark"
          }`}
        >
          {session.title ?? "Untitled session"}
        </span>
        <span className="shrink-0 text-small text-teal-600">
          {completed} of {DESIGN_STEPS.length}
        </span>
        <span className="w-28 shrink-0 text-right text-small text-faded-dark">
          {touched ?? ""}
        </span>
      </button>

      {/* Kept out of the way until the row is hovered, so a list of sessions
          doesn't read as a row of delete buttons. Focus reveals it too, or it
          would be unreachable by keyboard. */}
      <button
        type="button"
        onClick={handleDelete}
        aria-label={`Delete ${session.title ?? "this session"}`}
        className="shrink-0 cursor-pointer p-2 text-faded-dark opacity-0 transition-opacity duration-300 group-hover:opacity-100 hover:text-error focus-visible:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
