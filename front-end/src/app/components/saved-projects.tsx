"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { listSessions } from "@/lib/api";
import type { SessionSummary } from "@/lib/api";
import { countCompletedSteps, useSession } from "@/lib/session";
import { DESIGN_STEPS } from "@/lib/steps";
import { lastTouched } from "@/lib/time";
import ProjectsModal from "./projects-modal";
import { AnimatePresence } from "motion/react";

/** How many trees the row has space for. */
const VISIBLE = 3;

/**
 * The three most recent sessions, drawn as the geometric trees under the composer.
 *
 * Ordered oldest to newest left-to-right, so the row reads as a timeline and the
 * session you were last in sits at the end, nearest the composer you'd resume it
 * from.
 *
 * The listing is fetched once on mount rather than watched. This sits in the empty
 * state, and by the time a session changes anything the component is gone.
 */
interface SavedProjectsProps {
  /**
   * Fired once the listing has resolved, either way. The column is covered until
   * then, so this is what uncovers it.
   *
   * Must be stable — it is a dependency of the fetch below, so a callback rebuilt
   * every render would refetch the listing every render.
   */
  onSettled?: () => void;
}

export default function SavedProjects({ onSettled }: SavedProjectsProps) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [openModal, setOpenModal] = useState<boolean>(false);
  /**
   * Stays true from opening until the exit animation has finished, which is not
   * the same as `openModal`.
   *
   * Deleting the last session empties the row, and an empty row renders nothing.
   * Without this the whole component would unmount in the same commit that closes
   * the modal, taking the `AnimatePresence` with it — so the modal would blink out
   * rather than fade.
   */
  const [modalPresent, setModalPresent] = useState(false);

  function handleOpenProjectsModal(): void {
    setOpenModal(true);
    setModalPresent(true);
  }

  function handleCloseProjectsModal(): void {
    setOpenModal(false);
  }

  function handleModalGone(): void {
    setModalPresent(false);
  }

  /**
   * Drops a deleted session from the listing rather than refetching it.
   *
   * The listing is only fetched on mount, so without this the trees would keep
   * showing a session whose file is gone until the next reload.
   *
   * Deleting the last one closes the modal on purpose: there is nothing left to
   * list. It closes rather than lingering empty, but it closes by its own
   * animation rather than being yanked out from under the pointer.
   */
  function handleDeleted(id: string): void {
    // Computed outside the updater rather than inside it. An updater must be pure
    // — React double-invokes it under StrictMode, and a `setOpenModal` in there
    // would fire twice.
    const remaining = (sessions ?? []).filter((item) => item.id !== id);

    setSessions(remaining);

    if (remaining.length === 0) {
      setOpenModal(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const found = await listSessions();

        if (!cancelled) {
          setSessions(found);
        }
      } catch {
        // A store that can't be read is not worth interrupting the empty state
        // for. An empty row is the same thing the user sees on a first run.
        if (!cancelled) {
          setSessions([]);
        }
      } finally {
        // Reported on failure too. A store that cannot be read still leaves the
        // column covered forever if this only fires on success.
        if (!cancelled) {
          onSettled?.();
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [onSettled]);

  // Still fetching. The row holds its height so the column doesn't jump when the
  // real trees arrive.
  if (sessions === null) {
    return (
      <Row>
        {Array.from({ length: VISIBLE }, (_, index) => (
          <TreeSkeleton key={index} />
        ))}
      </Row>
    );
  }

  const hasSessions = sessions.length > 0;

  // Loaded and empty: no frame for projects that aren't there. Held back while the
  // modal is still fading, since unmounting now would cut the animation short.
  if (!hasSessions && !modalPresent) {
    return null;
  }

  // The listing arrives newest-first. Reversed so the newest lands at the end of
  // the row, nearest the composer you would resume it from.
  const shown = sessions.slice(0, VISIBLE).reverse();

  // The row is conditional but the wrapper is not: `AnimatePresence` has to keep
  // the same position in the tree across both, or React remounts it and the exit
  // never runs. The wrapper collapses to nothing once the row is gone.
  return (
    <div className="relative grid gap-y-5">
      {hasSessions && (
        <div className="w-full h-10 flex justify-between items-center">
          <p>Recent</p>
          <button onClick={handleOpenProjectsModal} className="text-teal-600">
            + more
          </button>
        </div>
      )}
      {hasSessions && (
        <Row>
          {shown.map((session) => (
            <Tree key={session.id} session={session} />
          ))}
        </Row>
      )}

      <AnimatePresence onExitComplete={handleModalGone}>
        {openModal && (
          <ProjectsModal
            key="projects"
            sessions={sessions}
            onClose={handleCloseProjectsModal}
            onDeleted={handleDeleted}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** The row's frame, shared so the skeleton occupies exactly the real layout. */
function Row({ children }: { children: ReactNode }) {
  return (
    <div className="w-full h-75 flex flex-col justify-end">
      <div className="w-full h-full grid grid-cols-3 gap-5">{children}</div>
      <div className="w-full border border-border" />
    </div>
  );
}

/**
 * A tree with its content not yet known.
 *
 * The bars stand in for the three lines a real tree shows, so the shape settles
 * rather than rearranging when the listing lands. Not a button: there is nothing
 * to open yet.
 */
function TreeSkeleton() {
  return (
    <div className="h-full">
      <div className="w-full h-55 flex flex-col items-center justify-center gap-y-2 rounded-full border border-[#202020] bg-linear-to-b from-[#0d0d0d] to-box-dark px-8">
        <span className="h-4 w-32 animate-pulse rounded bg-border" />
        <span className="h-3 w-28 animate-pulse rounded bg-border" />
        <span className="h-3 w-20 animate-pulse rounded bg-border" />
      </div>
      <div className="flex h-20">
        <div className="border-r border-border w-full"></div>
        <div className="w-full"></div>
      </div>
    </div>
  );
}

function Tree({ session }: { session: SessionSummary }) {
  const { load } = useSession();
  const completed = countCompletedSteps(session.stepHistory);
  const touched = lastTouched(session.updatedAt);

  async function handleOpen(): Promise<void> {
    await load(session.id);
  }

  return (
    <div className="h-full">
      {/* Same fill and hover as the step cards, so a saved project and a step read
          as the same kind of object. */}
      <button
        type="button"
        onClick={handleOpen}
        className="w-full h-55 flex flex-col items-center justify-center gap-y-2 rounded-full border border-[#202020] hover:border-teal-950 bg-linear-to-b from-[#0d0d0d] to-box-dark hover:from-[#001214] px-8 text-center transition-colors duration-500 cursor-pointer"
      >
        {/* Dimmed while the title is still the generated placeholder, the same
            signal the live header uses. */}
        <p
          className={`line-clamp-2 font-medium ${
            session.named ? "text-text" : "text-faded-dark"
          }`}
        >
          {session.title ?? "Untitled session"}
        </p>
        <p className="text-small text-teal-600">
          {completed} of {DESIGN_STEPS.length} steps completed
        </p>
        {touched !== null && (
          <p className="text-small text-faded-dark">{touched}</p>
        )}
      </button>
      <div className="flex h-20">
        <div className="border-r border-border w-full"></div>
        <div className="w-full"></div>
      </div>
    </div>
  );
}
