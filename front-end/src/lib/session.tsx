"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  createCheatsheet,
  getSession,
  putSession,
  streamChat,
  summarize,
} from "./api";
import type { ChatMessage, Role } from "./api";
import { parseSession } from "./parse-session";
import { FINISH_STEP, nextStep } from "./steps";
import type { SessionStep, StepAssessment, StepExit, StepVisit } from "./steps";

// Re-exported: these describe session state, so consumers reach for them here.
export type { SessionStep, StepAssessment, StepExit, StepVisit };

/** One message in the transcript. `id` doubles as the scroll target. */
export interface Turn {
  id: string;
  role: Role;
  content: string;
  /** Where the conversation was when this turn happened, Finish included. */
  step: SessionStep;
  streaming: boolean;
}

/** One line in the left-hand ledger, pointing back at its turn. */
export interface LedgerEntry {
  turnId: string;
  step: SessionStep;
  speaker: Role;
  /** null while the summary is still being generated. */
  summary: string | null;
  failed: boolean;
}

/** The document written to disk, one file per session. */
export interface PersistedSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Never blank. A session gets a dated placeholder the moment it is created, so a
   * run abandoned between steps is still findable in a listing.
   */
  title: string;
  /** False while `title` is still the generated placeholder. */
  named: boolean;
  currentStep: SessionStep;
  turns: Turn[];
  ledger: LedgerEntry[];
  stepHistory: StepVisit[];
  /** The scorecard, written in place once the cycle closes. */
  review: unknown | null;
  /**
   * The brief this cycle produced for the next one. Written when the user starts
   * an iteration from the scorecard, and left null on a cycle nobody continued.
   */
  cheatsheet: string | null;
  /** 1 for a cycle started from scratch. */
  iteration: number;
  /** The cycle this one was started from, if any. */
  parentId: string | null;
}

export type Status = "idle" | "streaming" | "error";

export interface SessionValue {
  sessionId: string | null;
  turns: Turn[];
  ledger: LedgerEntry[];
  stepHistory: StepVisit[];
  currentStep: SessionStep;
  /** The project name. Always displayable — a placeholder until the user names it. */
  title: string;
  /** Whether `title` came from the user rather than being the placeholder. */
  named: boolean;
  /** Renames the session. Blank restores the dated placeholder. */
  rename: (title: string) => void;
  /** Assistant replies delivered within the current step. Drives the escape hint. */
  stepTurnCount: number;
  /** BIDARA has recommended moving on and the user hasn't answered yet. */
  awaitingStepDecision: boolean;
  /** True once the first submission lands — drives the commit animation. */
  started: boolean;
  status: Status;
  error: string | null;
  submit: (text: string) => Promise<void>;
  /** Accept BIDARA's recommendation and move to the next step. */
  acceptAdvance: () => void;
  /** Decline it and keep working on the current step. */
  declineAdvance: () => void;
  /** Move on regardless — BIDARA is told the step was left unfinished. */
  forceAdvance: () => void;
  /** Whether the escape hint should be offered. */
  canForceAdvance: boolean;
  /**
   * The cycle is closed — the conversation has moved past the last design step.
   *
   * Derived rather than stored: `currentStep` is already persisted, so a reloaded
   * session knows it is finished without a field that could disagree with it.
   */
  finished: boolean;
  cancel: () => void;
  /**
   * Replaces everything with a session read from disk. Resolves to false if the
   * session is missing, unreadable, or a reply is streaming.
   *
   * Reachable only from the empty session, which `close` is the way back to.
   */
  load: (id: string) => Promise<boolean>;
  /**
   * Writes anything unsaved and returns to the empty session. The only way out of
   * a session, so it never refuses — a stream in progress is aborted.
   */
  close: () => Promise<void>;
  /** Which pass through the cycle this is. 1 unless it came from a scorecard. */
  iteration: number;
  /**
   * Closes this cycle and opens the next one seeded with a brief of it.
   *
   * Resolves null once the next cycle is open, or a message saying why it is not.
   * Returned rather than pushed into `error`, which the composer renders: this
   * fails without disturbing the session, and the place to say so is next to the
   * button that was pressed.
   */
  startNextIteration: () => Promise<string | null>;
  /** The brief is being written. The cycle has not closed yet. */
  preparingIteration: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

/** How many assistant replies in a step before the escape hint appears. */
const FORCE_ADVANCE_AFTER = 2;

/**
 * Saying this moves the conversation on whether or not BIDARA is satisfied. The
 * hint below the input fills it in, but it is a plain phrase on purpose — typing
 * it by hand works too, so the escape isn't hidden behind one affordance.
 */
export const FORCE_ADVANCE_PHRASE = "I want to move to the next step";

/**
 * Sits in front of the carry-forward brief, as the first thing BIDARA reads in a
 * new cycle.
 *
 * Without it the brief looks like a proposal, and BIDARA is told to treat any
 * artifact named in a challenge as a presupposition to attack — so iteration 2
 * would open by demolishing iteration 1's concept. Told plainly that it is reading
 * a closed cycle, it takes the brief as established and pulls from it what Define
 * actually needs. Naming the provenance is the whole fix; the brief below it is
 * left to be content.
 */
export const ITERATION_PREAMBLE =
  "This is the closing brief from a finished pass through the process on this same challenge. It is a record of work already done, not a proposal for you to critique. Read it as established, then pick up at Define from what it says is unresolved.";

/** "Foo" and "Foo — iteration 2" both become "Foo — iteration 3" at 3. */
const ITERATION_SUFFIX = /\s+—\s+iteration\s+\d+\s*$/;

function iterationTitle(title: string, iteration: number): string {
  return `${title.replace(ITERATION_SUFFIX, "")} — iteration ${iteration}`;
}

/**
 * Long enough that a burst of streaming tokens collapses into one write, short
 * enough that closing the tab shortly after a reply keeps it.
 */
const SAVE_DEBOUNCE_MS = 600;

function createId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

/**
 * The stand-in name a session carries until the user gives it one.
 *
 * Dated down to the minute because same-day sessions are the common case, and a
 * listing of six "Untitled session" rows is no better than six nulls. Derived from
 * the creation time rather than the current one, so restoring the placeholder
 * later doesn't re-date the session.
 */
function placeholderTitle(createdAt: string): string {
  const stamp = new Date(createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return `Untitled session — ${stamp}`;
}

/**
 * How many steps this session has finished with.
 *
 * A step counts once it has been *left*, which is all the app knows at the time —
 * it makes no distinction between one BIDARA signed off and one the user forced
 * past. `exit` keeps that difference for the end-of-session review.
 *
 * Reaches `DESIGN_STEPS.length` only once the challenge is closed: Emulate is
 * exited by the transition into `FINISH_STEP`, which exists so that the last step
 * ends the way the other four do. Finish itself is never exited and never counted.
 *
 * Shared by the live header and the saved-project listing so the two can't report
 * different numbers for the same session.
 */
export function countCompletedSteps(stepHistory: StepVisit[]): number {
  return stepHistory.filter((visit) => visit.exitedAt !== null).length;
}

/** Exported so the matching rules can be exercised directly. */
export function isForcePhrase(text: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  return normalize(text) === normalize(FORCE_ADVANCE_PHRASE);
}

/**
 * Owns everything about a session: the transcript, the ledger, where the
 * conversation sits in the design process, and how it got there.
 *
 * State that `submit` has to read is mirrored into refs. React state is only
 * correct at render time, and `submit` needs the step, the history and the
 * in-flight flag as of the moment it is called — a double-click would otherwise
 * see two "idle" closures and fire two requests.
 *
 * The session is persisted to a local JSON file after each turn, so a long run
 * through the process survives a reload. Keeping it on disk also means no design
 * leaves the machine except in the requests themselves.
 *
 * Loading always starts a fresh, empty session. Saved sessions are reached
 * deliberately through their own UI rather than by silently reopening the last
 * one — `listSessions`, `getSession` and `deleteSession` in `api.ts` are there for
 * it. Nothing here reads browser storage; `data/` is the only record of what
 * exists.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [stepHistory, setStepHistory] = useState<StepVisit[]>([]);
  const [currentStep, setCurrentStep] = useState<SessionStep>("Define");
  // Empty only before a session exists, which is also before anything is saved.
  const [title, setTitle] = useState("");
  const [named, setNamed] = useState(false);
  const [awaitingStepDecision, setAwaitingStepDecision] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [iteration, setIteration] = useState(1);
  const [preparingIteration, setPreparingIteration] = useState(false);

  const stepRef = useRef<SessionStep>("Define");
  /**
   * Mirrors `sessionId`, because `submit` mints one on first use and reads state
   * to decide whether it has to. Starting an iteration mints the id itself, and a
   * `submit` closed over the *previous* render's state would either mint a second
   * one over the top of it or, on a cleared session, skip the write entirely.
   */
  const sessionIdRef = useRef<string | null>(null);
  const iterationRef = useRef(1);
  const parentIdRef = useRef<string | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  const historyRef = useRef<StepVisit[]>([]);
  const busyRef = useRef(false);
  const forcedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const createdAtRef = useRef<string | null>(null);
  /**
   * True from the moment a session is loaded until the user changes something.
   *
   * Loading sets every piece of state at once, which fires the autosave below and
   * would rewrite the document with a fresh `updatedAt` — so merely opening a
   * session would reorder the saved-project row. Cleared by the mutation entry
   * points rather than by the effect, so any number of re-renders stays quiet while
   * nothing has actually changed.
   */
  const pristineRef = useRef(false);
  /**
   * Bumped whenever the session is replaced — closed or loaded.
   *
   * Work already in flight can't be recalled: an aborted stream still runs its
   * error path, and a summary request settles whenever the API gets round to it.
   * Both then call `setLedger`/`setTurns`. Without a generation to compare against,
   * the previous session's leftovers land in the next one — a ledger line for a
   * conversation that is no longer on screen.
   */
  const generationRef = useRef(0);
  /**
   * The document the debounce is about to write, kept where `close` can reach it.
   * Otherwise closing inside the debounce window discards the last turn.
   */
  const pendingRef = useRef<PersistedSession | null>(null);
  /**
   * The last document built, written or not.
   *
   * `pendingRef` is cleared once a write lands, so it cannot answer "what does this
   * session look like right now" — which is what starting an iteration needs, to
   * save the closing cycle with its brief attached.
   */
  const documentRef = useRef<PersistedSession | null>(null);

  const applyStep = useCallback((step: SessionStep): void => {
    stepRef.current = step;
    setCurrentStep(step);
  }, []);

  const applyTurns = useCallback(
    (update: (current: Turn[]) => Turn[]): void => {
      turnsRef.current = update(turnsRef.current);
      setTurns(turnsRef.current);
    },
    [],
  );

  const applyHistory = useCallback(
    (update: (current: StepVisit[]) => StepVisit[]): void => {
      historyRef.current = update(historyRef.current);
      setStepHistory(historyRef.current);
    },
    [],
  );

  /** Opens a visit for the current step if none is open yet. */
  const openVisit = useCallback((): void => {
    applyHistory((history) => {
      const last = history.at(-1);

      if (last !== undefined && last.exitedAt === null) {
        return history;
      }

      return [
        ...history,
        {
          step: stepRef.current,
          enteredAt: now(),
          exitedAt: null,
          exit: null,
          turnCount: 0,
          assessment: null,
        },
      ];
    });
  }, [applyHistory]);

  /** Closes the open visit and records how the step ended. */
  const closeVisit = useCallback(
    (exit: StepExit): void => {
      applyHistory((history) => {
        const last = history.at(-1);

        if (last === undefined || last.exitedAt !== null) {
          return history;
        }

        return [...history.slice(0, -1), { ...last, exitedAt: now(), exit }];
      });
    },
    [applyHistory],
  );

  /**
   * Files BIDARA's report against the visit it describes.
   *
   * `toPrevious` is what disambiguates. A forced advance closes the old visit and
   * opens the new one *before* the request goes out, so a report arriving on that
   * turn is about the step two entries back, not the one now open.
   */
  const attachAssessment = useCallback(
    (assessment: StepAssessment, toPrevious: boolean): void => {
      applyHistory((history) => {
        const index = history.length - (toPrevious ? 2 : 1);

        if (index < 0) {
          return history;
        }

        return history.map((visit, at) =>
          at === index ? { ...visit, assessment } : visit,
        );
      });
    },
    [applyHistory],
  );

  const countReply = useCallback((): void => {
    applyHistory((history) => {
      const last = history.at(-1);

      if (last === undefined || last.exitedAt !== null) {
        return history;
      }

      return [
        ...history.slice(0, -1),
        { ...last, turnCount: last.turnCount + 1 },
      ];
    });
  }, [applyHistory]);

  /**
   * Moves to the next step and flags the next request as forced, so BIDARA opens
   * by naming what was left unresolved instead of treating the step as finished.
   * Returns false at the last step, where there is nowhere to advance to.
   */
  const advanceForced = useCallback((): boolean => {
    const next = nextStep(stepRef.current);

    if (next === null) {
      return false;
    }

    pristineRef.current = false;
    closeVisit("forced");
    forcedRef.current = true;
    applyStep(next);
    openVisit();
    setAwaitingStepDecision(false);

    return true;
  }, [applyStep, closeVisit, openVisit]);

  /**
   * Summaries are fire-and-forget: a failed one leaves a marked ledger entry
   * rather than derailing the conversation. Errors are handled here so the
   * floating promise can never reject unhandled.
   */
  const fillSummary = useCallback(
    async (turnId: string, text: string, speaker: Role): Promise<void> => {
      const generation = generationRef.current;

      try {
        const summary = await summarize(text, speaker);

        if (generationRef.current !== generation) {
          return;
        }

        setLedger((entries) =>
          entries.map((entry) =>
            entry.turnId === turnId ? { ...entry, summary } : entry,
          ),
        );
      } catch {
        if (generationRef.current !== generation) {
          return;
        }

        setLedger((entries) =>
          entries.map((entry) =>
            entry.turnId === turnId ? { ...entry, failed: true } : entry,
          ),
        );
      }
    },
    [],
  );

  const submit = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();

      if (trimmed === "" || busyRef.current) {
        return;
      }

      busyRef.current = true;
      pristineRef.current = false;

      // Everything after the first await checks this. If the session was closed or
      // swapped meanwhile, the reply belongs to a conversation that is gone.
      const generation = generationRef.current;

      // A session gets an id and a creation time the first time it is used, so
      // an untouched app never writes a file. Read off the ref rather than state:
      // starting an iteration mints the id and then submits within the same tick,
      // and the state this closure captured is a render behind that.
      if (sessionIdRef.current === null) {
        const createdAt = now();
        const id = createId();
        createdAtRef.current = createdAt;
        sessionIdRef.current = id;
        setSessionId(id);
        setTitle(placeholderTitle(createdAt));
      }

      // Must happen before the step is read below, so the request carries the
      // step being moved *to*.
      if (isForcePhrase(trimmed)) {
        advanceForced();
      }

      openVisit();

      const step = stepRef.current;
      const forcedAdvance = forcedRef.current;
      forcedRef.current = false;

      const userTurn: Turn = {
        id: createId(),
        role: "user",
        content: trimmed,
        step,
        streaming: false,
      };

      const assistantTurn: Turn = {
        id: createId(),
        role: "assistant",
        content: "",
        step,
        streaming: true,
      };

      const history: ChatMessage[] = [
        ...turnsRef.current.map((turn) => ({
          role: turn.role,
          content: turn.content,
        })),
        { role: "user" as const, content: trimmed },
      ];

      applyTurns((current) => [...current, userTurn, assistantTurn]);
      setLedger((entries) => [
        ...entries,
        {
          turnId: userTurn.id,
          step,
          speaker: "user",
          summary: null,
          failed: false,
        },
      ]);
      setStatus("streaming");
      setError(null);
      setAwaitingStepDecision(false);

      void fillSummary(userTurn.id, trimmed, "user");

      const controller = new AbortController();
      abortRef.current = controller;

      function appendDelta(delta: string): void {
        applyTurns((current) =>
          current.map((turn) =>
            turn.id === assistantTurn.id
              ? { ...turn, content: turn.content + delta }
              : turn,
          ),
        );
      }

      try {
        const result = await streamChat({
          messages: history,
          currentStep: step,
          forcedAdvance,
          signal: controller.signal,
          onDelta: appendDelta,
        });

        // `finally` still runs on this return, so the busy flag is released.
        if (generationRef.current !== generation) {
          return;
        }

        applyTurns((current) =>
          current.map((turn) =>
            turn.id === assistantTurn.id ? { ...turn, streaming: false } : turn,
          ),
        );

        const reply =
          turnsRef.current.find((turn) => turn.id === assistantTurn.id)
            ?.content ?? "";

        setStatus("idle");
        countReply();
        setAwaitingStepDecision(result.stepComplete && nextStep(step) !== null);

        if (result.assessment !== null) {
          // Attribution comes from the token BIDARA chose, not from how the turn
          // was sent. Being told the user moved on early does not stop it
          // answering about the step it is now on, and reading `forcedAdvance` as
          // the answer filed those reports one step back — the step they were
          // about kept nothing, and the step they landed on was credited with a
          // report it had not earned.
          //
          // Finish stays an override: it has no criteria and is never reported on,
          // so a report arriving there is the closing read on Emulate however
          // BIDARA labelled it.
          attachAssessment(
            result.assessment,
            result.reportsPrevious || step === FINISH_STEP,
          );
        }
        setLedger((entries) => [
          ...entries,
          {
            turnId: assistantTurn.id,
            step,
            speaker: "assistant",
            summary: null,
            failed: false,
          },
        ]);

        if (reply !== "") {
          void fillSummary(assistantTurn.id, reply, "assistant");
        }
      } catch (caught) {
        // Closing aborts the stream, which lands here. There is no bubble left to
        // clean up and no error worth showing — the session is gone.
        if (generationRef.current !== generation) {
          return;
        }

        // Either way the half-written assistant bubble goes away.
        applyTurns((current) =>
          current.filter((turn) => turn.id !== assistantTurn.id),
        );

        if (controller.signal.aborted) {
          setStatus("idle");
        } else {
          setStatus("error");
          setError(
            caught instanceof Error ? caught.message : "Something went wrong.",
          );
        }
      } finally {
        abortRef.current = null;
        busyRef.current = false;
      }
    },
    [
      advanceForced,
      applyTurns,
      attachAssessment,
      countReply,
      fillSummary,
      openVisit,
    ],
  );

  const acceptAdvance = useCallback((): void => {
    const next = nextStep(stepRef.current);

    if (next === null) {
      return;
    }

    pristineRef.current = false;
    closeVisit("signed-off");
    applyStep(next);
    openVisit();
    setAwaitingStepDecision(false);
  }, [applyStep, closeVisit, openVisit]);

  const declineAdvance = useCallback((): void => {
    setAwaitingStepDecision(false);
  }, []);

  const forceAdvance = useCallback((): void => {
    advanceForced();
  }, [advanceForced]);

  const cancel = useCallback((): void => {
    abortRef.current?.abort();
  }, []);

  // Clearing the field restores the placeholder instead of leaving the session
  // blank — there is no state in which a session has no name.
  const rename = useCallback((next: string): void => {
    const trimmed = next.trim();
    pristineRef.current = false;

    if (trimmed === "") {
      setTitle(placeholderTitle(createdAtRef.current ?? now()));
      setNamed(false);
      return;
    }

    setTitle(trimmed);
    setNamed(true);
  }, []);

  /** Back to a blank session. State and every mirror, or the next turn inherits. */
  const clearState = useCallback((): void => {
    stepRef.current = "Define";
    turnsRef.current = [];
    historyRef.current = [];
    createdAtRef.current = null;
    forcedRef.current = false;
    pristineRef.current = false;
    pendingRef.current = null;
    documentRef.current = null;
    sessionIdRef.current = null;
    iterationRef.current = 1;
    parentIdRef.current = null;

    setSessionId(null);
    setTurns([]);
    setLedger([]);
    setStepHistory([]);
    setCurrentStep("Define");
    setTitle("");
    setNamed(false);
    setAwaitingStepDecision(false);
    setStatus("idle");
    setError(null);
    setIteration(1);
  }, []);

  /**
   * Saves what is unwritten and returns to the empty session.
   *
   * Bumping the generation first orphans the in-flight stream and any pending
   * summaries, so none of them can write into the blank session behind it.
   *
   * The write is awaited *before* clearing, which matters more than it looks:
   * clearing renders the saved-project row, which immediately refetches the
   * listing. Save afterwards and the two race — you would land on the main screen
   * looking at this session as it was a turn ago, or not see it at all if it was
   * closed inside the debounce window. It is a local file, so the wait is
   * milliseconds.
   */
  const close = useCallback(async (): Promise<void> => {
    generationRef.current += 1;

    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;

    const pending = pendingRef.current;

    if (pending !== null) {
      try {
        await putSession(pending.id, pending);
      } catch {
        // Leaving is not the moment to block on a failed write. The document on
        // disk is one turn behind rather than lost.
      }
    }

    clearState();
  }, [clearState]);

  /**
   * Closes this cycle and opens the next one carrying a brief of it.
   *
   * The brief is written *before* anything is torn down. It is the one step that
   * can fail — it is a model call over the whole transcript — and failing after the
   * session had been cleared would lose a finished cycle to a network blip. So on
   * failure nothing has moved and the scorecard is still on screen.
   *
   * The closing cycle is then saved with its brief attached, which is what makes
   * the pair readable later: one document says what it produced, the next says
   * what it started from.
   *
   * The new session is minted here rather than left to `submit`, because it needs
   * an identity — an inherited title, an iteration number, a parent — before its
   * first message exists.
   */
  const startNextIteration = useCallback(async (): Promise<string | null> => {
    const closing = documentRef.current;

    if (closing === null) {
      return "There is nothing saved to carry forward yet.";
    }

    if (preparingIteration) {
      return null;
    }

    setPreparingIteration(true);

    let brief: string;

    try {
      brief = await createCheatsheet(
        closing.title,
        closing.stepHistory,
        closing.turns.map((turn) => ({
          role: turn.role,
          content: turn.content,
        })),
      );
    } catch (caught) {
      setPreparingIteration(false);

      return caught instanceof Error
        ? caught.message
        : "The brief for the next iteration could not be written.";
    }

    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;

    const closed: PersistedSession = {
      ...closing,
      updatedAt: now(),
      cheatsheet: brief,
    };

    try {
      await putSession(closed.id, closed);
    } catch {
      // The brief is about to be posted into the next cycle either way, so the
      // work is not lost — only the record of which cycle produced it.
    }

    const next = iterationRef.current + 1;
    const parentTitle = closed.title;
    const parentNamed = closed.named;
    const parentId = closed.id;

    clearState();

    const createdAt = now();
    const id = createId();

    createdAtRef.current = createdAt;
    sessionIdRef.current = id;
    iterationRef.current = next;
    parentIdRef.current = parentId;

    setSessionId(id);
    setIteration(next);
    setParentTitle(parentTitle, parentNamed, next, createdAt);
    setPreparingIteration(false);

    // Not awaited. The reply streams into the new session, and the caller only
    // needs to know the switch happened.
    void submit(`${ITERATION_PREAMBLE}\n\n${brief}`);

    return null;

    /** An unnamed parent passes on nothing worth inheriting but its lineage. */
    function setParentTitle(
      title: string,
      named: boolean,
      iterationNumber: number,
      at: string,
    ): void {
      if (named) {
        setTitle(iterationTitle(title, iterationNumber));
        setNamed(true);
        return;
      }

      setTitle(placeholderTitle(at));
      setNamed(false);
    }
  }, [clearState, preparingIteration, submit]);

  const load = useCallback(async (id: string): Promise<boolean> => {
    // Loading would replace the transcript the stream is writing into.
    if (busyRef.current) {
      return false;
    }

    let document: PersistedSession | null = null;

    try {
      document = parseSession(id, await getSession(id));
    } catch {
      document = null;
    }

    if (document === null) {
      setStatus("error");
      setError("That session could not be opened.");
      return false;
    }

    // Refs first, and all of them. `submit` reads these rather than state, so a
    // mirror left behind wouldn't surface until the next message — by which point
    // the request carries the previous session's step and history.
    generationRef.current += 1;

    stepRef.current = document.currentStep;
    turnsRef.current = document.turns;
    historyRef.current = document.stepHistory;
    createdAtRef.current = document.createdAt;
    forcedRef.current = false;
    pristineRef.current = true;
    pendingRef.current = null;
    documentRef.current = document;
    sessionIdRef.current = document.id;
    iterationRef.current = document.iteration;
    parentIdRef.current = document.parentId;

    setSessionId(document.id);
    setIteration(document.iteration);
    setTurns(document.turns);
    setLedger(document.ledger);
    setStepHistory(document.stepHistory);
    setCurrentStep(document.currentStep);
    // The parser leaves an unnamed title empty rather than guessing, because the
    // placeholder needs `createdAt` resolved first.
    setTitle(
      document.title === ""
        ? placeholderTitle(document.createdAt)
        : document.title,
    );
    setNamed(document.named);
    setAwaitingStepDecision(false);
    setStatus("idle");
    setError(null);

    return true;
  }, []);

  // Debounced autosave. Streaming touches `turns` on every token, so the timer
  // keeps resetting and only one write lands once the reply settles.
  //
  // The `turns.length` guard is what stops a freshly opened, untouched app from
  // writing an empty file.
  useEffect(() => {
    if (sessionId === null || turns.length === 0 || pristineRef.current) {
      return;
    }

    const createdAt = createdAtRef.current ?? now();

    // Built now rather than inside the timer, so `close` can flush it without
    // waiting out the debounce.
    const document: PersistedSession = {
      id: sessionId,
      createdAt,
      updatedAt: now(),
      // Belt and braces: the invariant holds here regardless of how state was
      // sequenced upstream, so no file can carry a blank title.
      title: title === "" ? placeholderTitle(createdAt) : title,
      named,
      currentStep,
      turns,
      ledger,
      stepHistory,
      review: null,
      // Written only when an iteration is started from this cycle, which happens
      // outside the debounce — so it is preserved here rather than reset.
      cheatsheet: documentRef.current?.cheatsheet ?? null,
      iteration: iterationRef.current,
      parentId: parentIdRef.current,
    };

    pendingRef.current = document;
    documentRef.current = document;

    const timer = window.setTimeout(function save(): void {
      async function write(): Promise<void> {
        try {
          await putSession(document.id, document);

          // Only clear it if nothing newer has queued up behind this write.
          if (pendingRef.current === document) {
            pendingRef.current = null;
          }
        } catch {
          // A failed save must not interrupt the conversation. The next turn
          // writes the whole document again, so one lost write self-heals — and
          // leaving it pending means `close` retries it.
        }
      }

      void write();
    }, SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [sessionId, turns, ledger, stepHistory, currentStep, title, named]);

  const stepTurnCount = stepHistory.at(-1)?.turnCount ?? 0;

  const value = useMemo<SessionValue>(
    () => ({
      sessionId,
      turns,
      ledger,
      stepHistory,
      currentStep,
      title,
      named,
      rename,
      stepTurnCount,
      awaitingStepDecision,
      started: turns.length > 0,
      status,
      error,
      submit,
      acceptAdvance,
      declineAdvance,
      forceAdvance,
      canForceAdvance:
        stepTurnCount >= FORCE_ADVANCE_AFTER &&
        status !== "streaming" &&
        nextStep(currentStep) !== null,
      finished: currentStep === FINISH_STEP,
      cancel,
      load,
      close,
      iteration,
      startNextIteration,
      preparingIteration,
    }),
    [
      sessionId,
      turns,
      ledger,
      stepHistory,
      currentStep,
      title,
      named,
      rename,
      stepTurnCount,
      awaitingStepDecision,
      status,
      error,
      submit,
      acceptAdvance,
      declineAdvance,
      forceAdvance,
      cancel,
      load,
      close,
      iteration,
      startNextIteration,
      preparingIteration,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);

  if (value === null) {
    throw new Error("useSession must be used inside a SessionProvider.");
  }

  return value;
}
