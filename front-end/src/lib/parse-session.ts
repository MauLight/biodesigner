import { isDesignStep } from "./steps";
import type {
  DesignStep,
  StepAssessment,
  StepExit,
  StepVisit,
} from "./steps";
import type { LedgerEntry, PersistedSession, Turn } from "./session";

/**
 * Turns whatever is on disk into a session the app can run.
 *
 * The store deliberately writes bytes without validating them, and files predate
 * fields that exist now — the earliest sessions have `title: null` and no `named`
 * key at all. So nothing here trusts the shape: every field is checked, and a
 * malformed entry is dropped rather than allowed to crash a render three components
 * later.
 *
 * Dropping is the right failure mode for entries and refusing is the right one for
 * the document. A ledger line with no `turnId` is noise; a session with no `turns`
 * array is not a session.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

function asStep(value: unknown, fallback: DesignStep): DesignStep {
  return isDesignStep(value) ? value : fallback;
}

function asRole(value: unknown): "user" | "assistant" | null {
  return value === "user" || value === "assistant" ? value : null;
}

function asExit(value: unknown): StepExit | null {
  return value === "signed-off" || value === "forced" ? value : null;
}

function parseTurn(value: unknown, step: DesignStep): Turn | null {
  if (!isRecord(value)) {
    return null;
  }

  const role = asRole(value.role);

  if (typeof value.id !== "string" || role === null) {
    return null;
  }

  return {
    id: value.id,
    role,
    content: typeof value.content === "string" ? value.content : "",
    step: asStep(value.step, step),
    // A turn saved mid-stream is finished as far as a reload is concerned. Left
    // true, its bubble would render as streaming forever.
    streaming: false,
  };
}

function parseLedgerEntry(value: unknown, step: DesignStep): LedgerEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const speaker = asRole(value.speaker);

  if (typeof value.turnId !== "string" || speaker === null) {
    return null;
  }

  return {
    turnId: value.turnId,
    step: asStep(value.step, step),
    speaker,
    summary: typeof value.summary === "string" ? value.summary : null,
    failed: value.failed === true,
  };
}

function parseAssessment(value: unknown): StepAssessment | null {
  if (!isRecord(value)) {
    return null;
  }

  const points = (raw: unknown): string[] =>
    Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === "string")
      : [];

  return {
    floorMet: value.floorMet === true,
    handoffMet: value.handoffMet === true,
    strengths: points(value.strengths),
    gaps: points(value.gaps),
  };
}

function parseVisit(value: unknown): StepVisit | null {
  if (!isRecord(value) || !isDesignStep(value.step)) {
    return null;
  }

  const exitedAt = typeof value.exitedAt === "string" ? value.exitedAt : null;

  return {
    step: value.step,
    enteredAt: asString(value.enteredAt, ""),
    exitedAt,
    // An exit reason without an exit time would make a step look both open and
    // finished, and `countCompletedSteps` reads the time.
    exit: exitedAt === null ? null : asExit(value.exit),
    turnCount:
      typeof value.turnCount === "number" && Number.isFinite(value.turnCount)
        ? value.turnCount
        : 0,
    // Absent in sessions saved before BIDARA reported on its steps.
    assessment: parseAssessment(value.assessment),
  };
}

export function parseSession(
  id: string,
  value: unknown,
): PersistedSession | null {
  if (!isRecord(value) || !Array.isArray(value.turns)) {
    return null;
  }

  const createdAt = asString(value.createdAt, new Date().toISOString());
  const currentStep = asStep(value.currentStep, "Define");

  const ledger = Array.isArray(value.ledger) ? value.ledger : [];
  const stepHistory = Array.isArray(value.stepHistory) ? value.stepHistory : [];

  return {
    // The filename is the authority, not the field — they can only disagree if
    // something wrote the file by hand.
    id,
    createdAt,
    updatedAt: asString(value.updatedAt, createdAt),
    // Callers supply the placeholder, which needs `createdAt` to be resolved
    // first. Empty string is the signal, not a valid title.
    title: asString(value.title, ""),
    named: value.named === true,
    currentStep,
    turns: value.turns
      .map((turn) => parseTurn(turn, currentStep))
      .filter((turn): turn is Turn => turn !== null),
    ledger: ledger
      .map((entry) => parseLedgerEntry(entry, currentStep))
      .filter((entry): entry is LedgerEntry => entry !== null),
    stepHistory: stepHistory
      .map(parseVisit)
      .filter((visit): visit is StepVisit => visit !== null),
    review: value.review ?? null,
    cheatsheet: value.cheatsheet ?? null,
  };
}
