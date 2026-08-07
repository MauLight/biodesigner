"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Trash2 } from "lucide-react";

import ConfirmDialog from "./confirm-dialog";
import CustomScrollbar from "./custom-scrollbar";
import { deleteSession } from "@/lib/api";
import type { SessionSummary } from "@/lib/api";
import { countCompletedSteps, useSession } from "@/lib/session";
import { DESIGN_STEPS } from "@/lib/steps";
import { lastTouched } from "@/lib/time";

interface ProjectsListProps {
  /** Newest first, as the listing returns them. */
  sessions: SessionSummary[];
  /** Reports a deletion so the caller can drop it from the listing it owns. */
  onDeleted: (id: string) => void;
  /**
   * Called once a session is open. The modal closes on it; rendered in the
   * column there is nothing to get out of the way.
   */
  onOpened?: () => void;
  /**
   * Fires while the delete confirmation is up, so a containing modal can stand
   * down its own Escape handler — otherwise one press dismisses both layers and
   * the question looks like it was answered.
   */
  onConfirming?: (active: boolean) => void;
}

/**
 * Every saved session, as a list.
 *
 * Same three facts per row as a tree — title, progress, last touched — laid out as
 * a list rather than a shape, because the point here is scanning a long set rather
 * than glancing at the recent one. Newest first: the trees read left-to-right as a
 * timeline, but a list reads top-down as a ranking.
 *
 * Shared by the projects modal and by the column itself at narrow widths, where
 * three circles have nowhere near the room for a title. Two copies of a list with
 * a delete confirmation behind it would have drifted, and the one that drifted
 * would be the one that deletes files.
 *
 * Sized by its container: it fills whatever height it is given and scrolls inside
 * it, so the caller decides between a modal panel and a corner of a column.
 */
export default function ProjectsList({
  sessions,
  onDeleted,
  onOpened,
  onConfirming,
}: ProjectsListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SessionSummary | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // The scrollbar only appears when there is something to scroll. Re-measured on
  // resize, since the height comes from the container rather than being fixed —
  // the same list overflows or doesn't depending on the window.
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

  function handleRequestDelete(session: SessionSummary): void {
    setDeleteError(null);
    setPendingDelete(session);
    onConfirming?.(true);
  }

  function handleCancelDelete(): void {
    setPendingDelete(null);
    setDeleteError(null);
    onConfirming?.(false);
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
      onConfirming?.(false);
    } catch {
      // Kept open on failure, so a file that is still there doesn't vanish from
      // the list as though it were gone.
      setDeleteError("That session could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    // `relative` is what the scrollbar positions against; it hangs at `-right-4`,
    // so the caller has to leave it that much room.
    <div className="relative flex min-h-0 flex-col">
      <ul
        ref={listRef}
        className="scrollbar-hide flex min-h-0 flex-col gap-y-2 overflow-y-auto"
      >
        {sessions.map((session) => (
          <Row
            key={session.id}
            session={session}
            onOpened={onOpened}
            onRequestDelete={handleRequestDelete}
          />
        ))}
      </ul>

      {overflows && <CustomScrollbar scrollRef={listRef} />}

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
    </div>
  );
}

interface RowProps {
  session: SessionSummary;
  /** Called once the session is open, if the caller has anything to do about it. */
  onOpened?: () => void;
  /** Asks for confirmation. Nothing is deleted from here. */
  onRequestDelete: (session: SessionSummary) => void;
}

function Row({ session, onOpened, onRequestDelete }: RowProps) {
  const { load } = useSession();
  const completed = countCompletedSteps(session.stepHistory);
  const touched = lastTouched(session.updatedAt);

  async function handleOpen(): Promise<void> {
    // Nothing reported on failure: `load` puts the reason in the session error,
    // and closing the modal would hide it behind the empty state.
    if (await load(session.id)) {
      onOpened?.();
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
        {/* Dropped below `lg`, which is exactly where this list is rendered in
            the column rather than in a modal. It is the least load-bearing of the
            three, and the title is what a row is for. A viewport breakpoint, not
            a container one: a query container here would become the containing
            block for the fixed confirmation dialog below. */}
        <span className="hidden w-28 shrink-0 text-right text-small text-faded-dark lg:block">
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
