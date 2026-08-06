"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Brain } from "lucide-react";

import Input from "./input";
import GenerateButton from "./generate-button";
import Interactions from "./interactions";
import MarkdownHints from "./markdown-hints";
import SavedProjects from "./saved-projects";
import SessionTitle from "./session-title";
import StepControls from "./step-controls";
import TitleModal from "./title-modal";
import { useSession } from "@/lib/session";

const COMPOSER_LABEL = "Describe the challenge you want to work on";

/**
 * How long a queued message is narrated in the composer before it sends.
 *
 * The delay is the point: the user sees what the app is about to do and can stop
 * it, rather than a reply materialising from nothing.
 */
const AUTO_SEND_DELAY_MS = 2200;

/** A message the app has queued on the user's behalf. */
interface QueuedMessage {
  /** Sent when the timer fires. Never placed in the input's value. */
  text: string;
  /** Shown as the placeholder while the timer runs. */
  notice: string;
}

/**
 * The left column: the hero block and the prompt composer.
 *
 * Was `navbar.tsx`, which was a misnomer inherited from the donor — it is not
 * navigation, it is where the user writes. It owns only the draft text; the
 * conversation itself lives in the session.
 *
 * The column is centred until the first message, then commits: the hero fades
 * out and the composer settles to the bottom, where it stays for the session.
 * `justify-content` can't be animated, so the class swap is instant and
 * motion's `layout` prop animates the resulting displacement.
 */
export default function Generator() {
  const [draft, setDraft] = useState("");
  const [queued, setQueued] = useState<QueuedMessage | null>(null);
  const [naming, setNaming] = useState<QueuedMessage | null>(null);
  const { submit, cancel, rename, status, error, named, started, sessionId } =
    useSession();
  const reduceMotion = useReducedMotion();

  /**
   * Covers the column until the saved-project listing has resolved.
   *
   * Without it the first paint shows three skeleton trees, and when the listing
   * comes back empty they vanish and the composer slides to centre — a flash of
   * furniture that was never really there.
   *
   * A one-way latch: closing a session remounts the row and refetches, but by
   * then the app is on screen and a black curtain would be worse than the
   * skeletons it hides.
   */
  const [veiled, setVeiled] = useState(true);

  const timerRef = useRef<number | null>(null);
  // The naming modal is offered once per session. Without this, skipping would
  // put it back on screen at the next step boundary.
  const namingOfferedRef = useRef(false);

  // Insurance. `SavedProjects` only renders before a session starts, so if one is
  // somehow already underway there is nothing left to report the listing.
  if (veiled && started) {
    setVeiled(false);
  }

  // Stable: it is a dependency of the listing fetch, and a fresh identity each
  // render would refetch on every render.
  const handleProjectsSettled = useCallback(function settled(): void {
    setVeiled(false);
  }, []);

  function clearQueued(): void {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setQueued(null);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  // This component outlives the session — closing one does not unmount it — so the
  // once-per-session flag has to be reset by hand. Without it, the second session
  // of a sitting would never be offered a name.
  useEffect(() => {
    namingOfferedRef.current = false;
  }, [sessionId]);

  async function send(text: string): Promise<void> {
    clearQueued();

    if (text.trim() === "" || status === "streaming") {
      return;
    }

    // Cleared straight away: the text is already in the transcript, so nothing
    // is lost if the request fails.
    setDraft("");
    await submit(text);
  }

  async function handleGenerate(): Promise<void> {
    await send(draft);
  }

  /** Typing cancels anything the app had queued — the user has taken over. */
  function handleDraftChange(value: string): void {
    clearQueued();
    setDraft(value);
  }

  /**
   * Queues a message and sends it shortly after. The text goes in the
   * placeholder, not the value, so typing during the window produces a clean
   * draft rather than being appended to a sentence the user didn't write.
   */
  function startQueue(message: QueuedMessage): void {
    clearQueued();
    setDraft("");
    setQueued(message);

    timerRef.current = window.setTimeout(function fire(): void {
      timerRef.current = null;
      setQueued(null);
      void send(message.text);
    }, AUTO_SEND_DELAY_MS);
  }

  /**
   * Every queued message is a step transition — both step controls route here —
   * so the first one is also the moment to ask for a project name.
   *
   * The transition is held, not run in parallel: the modal takes the screen and
   * the message only starts its countdown once the modal is gone. Firing both at
   * once would mean the reply arrives behind a dialog the user is still reading.
   */
  function handleQueue(text: string, notice: string): void {
    if (!namingOfferedRef.current && !named) {
      namingOfferedRef.current = true;
      clearQueued();
      setDraft("");
      setNaming({ text, notice });
      return;
    }

    startQueue({ text, notice });
  }

  /** Runs on save and on skip alike, releasing the held transition either way. */
  function handleNamingClose(): void {
    const held = naming;
    setNaming(null);

    if (held !== null) {
      startQueue(held);
    }
  }

  const settle = reduceMotion
    ? { duration: 0 }
    : { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-y-20 px-20 ${
        started ? "justify-end pb-10" : "justify-center"
      }`}
    >
      <AnimatePresence>
        {naming !== null && (
          <TitleModal
            key="naming"
            onSave={rename}
            onClose={handleNamingClose}
          />
        )}
      </AnimatePresence>

      {/* The title takes its height off the ledger below it, so the ledger's own
          top edge stays the clipping boundary. */}
      {started && <SessionTitle />}

      {/* Absorbs the space above the composer once a conversation exists, which
          is what holds the composer at the bottom. */}
      {started && <Interactions />}

      <motion.nav
        layout="position"
        transition={settle}
        className="relative z-10 flex w-full flex-col justify-start gap-5"
      >
        <AnimatePresence>
          {!started && (
            <motion.div
              key="hero"
              // In flow, so the nav's box includes it and `justify-center` centres
              // the hero and composer together. Absolutely positioned it hung
              // outside the box, and the column centred the composer alone —
              // which read as the whole thing sitting too high.
              //
              // Height collapses on the way out as well as opacity, so the
              // composer travels down in one continuous motion instead of waiting
              // for the fade to finish and then jumping.
              initial={false}
              animate={{ opacity: 1, height: "auto", marginBottom: 20 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3 }}
              className="flex flex-col overflow-hidden"
            >
              <div className="flex items-center gap-x-2">
                <Brain className="h-8 w-8 text-teal-600" />
                <h1 className="text-[2.3rem] font-medium text-text">
                  BioDesigner
                </h1>
              </div>
              <p className="text-[#a9a9a9] pl-1">
                A <b>BIDARA</b> design assistant.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* `relative` anchors the hints button out in the column's padding and
            the hints panel to the composer's left edge. */}
        <div className="relative flex items-end">
          <MarkdownHints visible={draft.trim() !== ""} />
          <div className="flex-1">
            <Input
              label={COMPOSER_LABEL}
              placeholder={queued?.notice}
              value={draft}
              onChange={handleDraftChange}
              onSubmit={handleGenerate}
              disabled={status === "streaming"}
            />
          </div>
          <GenerateButton
            status={status}
            disabled={draft.trim() === ""}
            onGenerate={handleGenerate}
            onCancel={cancel}
          />
        </div>

        <div className="flex min-h-6 flex-col gap-2 text-small">
          <StepControls onQueue={handleQueue} suppressed={queued !== null} />
          {error !== null && <span className="text-error">{error}</span>}
        </div>
      </motion.nav>
      {/* Only in the empty state: once a conversation exists the column belongs
          to it, and the ledger needs the height. */}
      {!started && <SavedProjects onSettled={handleProjectsSettled} />}

      {/* Absolute against the column wrapper in page.tsx, which is the one
          `relative` ancestor — so it covers the padding too, not just the
          content. Above the nav's z-10; below the modals, which cannot be open
          this early anyway. */}
      <AnimatePresence>
        {veiled && (
          <motion.div
            key="veil"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35 }}
            className="absolute inset-0 z-30 bg-black"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
