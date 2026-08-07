import type { SessionStep, StepAssessment, StepVisit } from "./steps";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

/** What the back-end reports once a reply has finished streaming. */
export interface ChatResult {
  step: SessionStep;
  /** BIDARA thinks this step is satisfied. A recommendation, not a transition. */
  stepComplete: boolean;
  /**
   * The report is about the step just left rather than the current one.
   *
   * Taken from which of the two tokens BIDARA used, which is the only statement of
   * attribution that comes from the model itself.
   */
  reportsPrevious: boolean;
  /**
   * BIDARA's report on a step, stripped out of the reply before it reached us.
   * `reportsPrevious` says which step it belongs to.
   */
  assessment: StepAssessment | null;
}

export interface StreamChatOptions {
  messages: ChatMessage[];
  currentStep: SessionStep;
  forcedAdvance?: boolean;
  signal?: AbortSignal;
  /** Called for every token as it arrives. */
  onDelta: (delta: string) => void;
}

/** An error the back-end reported, as opposed to a transport failure. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readError(response: Response): Promise<never> {
  let message = `Request failed with status ${response.status}.`;

  try {
    const body: unknown = await response.json();

    if (
      typeof body === "object" &&
      body !== null &&
      typeof (body as { error?: unknown }).error === "string"
    ) {
      message = (body as { error: string }).error;
    }
  } catch {
    // Body wasn't JSON. The status-based message above will do.
  }

  throw new ApiError(message, response.status);
}

interface ServerSentEvent {
  event: string | null;
  data: unknown;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Narrows the report off the wire. Anything unexpected is simply absent. */
function readAssessment(value: unknown): StepAssessment | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;

  return {
    floorMet: record.floorMet === true,
    handoffMet: record.handoffMet === true,
    strengths: strings(record.strengths),
    gaps: strings(record.gaps),
  };
}

/**
 * Parses one `\n\n`-delimited SSE frame. Returns null for frames carrying no
 * data — comments and keep-alives.
 */
function parseFrame(frame: string): ServerSentEvent | null {
  let event: string | null = null;
  const data: string[] = [];

  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).trim());
    }
  }

  if (data.length === 0) {
    return null;
  }

  return { event, data: JSON.parse(data.join("\n")) };
}

/**
 * Streams a BIDARA reply, calling `onDelta` for each token.
 *
 * `EventSource` is GET-only and this is a POST, so the stream is read off
 * `fetch` by hand. Failures before the first token arrive as a normal JSON error
 * with a real status — the back-end holds the SSE headers back until it has
 * content precisely so that can happen — and surface here as an `ApiError`.
 * Failures mid-stream arrive as an `error` event and are thrown.
 *
 * Aborting `signal` also cancels the upstream OpenAI request.
 */
export async function streamChat({
  messages,
  currentStep,
  forcedAdvance = false,
  signal,
  onDelta,
}: StreamChatOptions): Promise<ChatResult> {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, currentStep, forcedAdvance }),
    signal,
  });

  if (!response.ok) {
    await readError(response);
  }

  if (response.body === null) {
    throw new Error("The response carried no body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ChatResult = {
    step: currentStep,
    stepComplete: false,
    reportsPrevious: false,
    assessment: null,
  };

  function handle(frame: string): void {
    const parsed = parseFrame(frame);

    if (parsed === null) {
      return;
    }

    const data = parsed.data as Record<string, unknown>;

    if (parsed.event === "error") {
      throw new Error(
        typeof data.error === "string" ? data.error : "The stream failed.",
      );
    }

    if (parsed.event === "done") {
      result = {
        step: (data.step as SessionStep | undefined) ?? currentStep,
        stepComplete: data.stepComplete === true,
        reportsPrevious: data.reportsPrevious === true,
        // Already validated server-side, where the raw JSON was parsed. Narrowed
        // rather than trusted, since it arrives over the wire like anything else.
        assessment: readAssessment(data.assessment),
      };
      return;
    }

    if (typeof data.delta === "string") {
      onDelta(data.delta);
    }
  }

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      handle(frame);
    }
  }

  // A final frame may be sitting in the buffer with no trailing blank line.
  if (buffer.trim() !== "") {
    handle(buffer);
  }

  return result;
}

/**
 * Metadata for one saved session, as returned by the listing.
 *
 * Every field except `id` is nullable or defaulted: files written before titles
 * existed have `title: null` and no `named` key, and the server passes through what
 * it finds rather than migrating. Treat this as untrusted shape.
 */
export interface SessionSummary {
  id: string;
  createdAt: string | null;
  updatedAt: string | null;
  title: string | null;
  named: boolean;
  currentStep: string | null;
  turnCount: number;
  stepHistory: StepVisit[];
}

/** Writes the whole session document. The server only persists it. */
export async function putSession(id: string, session: unknown): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/sessions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  });

  if (!response.ok) {
    await readError(response);
  }
}

/** Returns null when there is no session with that id. */
export async function getSession(id: string): Promise<unknown | null> {
  const response = await fetch(`${API_BASE_URL}/api/sessions/${id}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    await readError(response);
  }

  return response.json();
}

export async function listSessions(): Promise<SessionSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/sessions`);

  if (!response.ok) {
    await readError(response);
  }

  const body: unknown = await response.json();
  const sessions = (body as { sessions?: unknown }).sessions;

  return Array.isArray(sessions) ? (sessions as SessionSummary[]) : [];
}

export async function deleteSession(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/sessions/${id}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 404) {
    await readError(response);
  }
}

/**
 * Compresses one turn into a ledger sentence. `speaker` picks the subject noun
 * server-side: "Human" for the user, "BioDesigner" for the model.
 */
export async function summarize(
  text: string,
  speaker: Role,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, speaker }),
    signal,
  });

  if (!response.ok) {
    await readError(response);
  }

  const body: unknown = await response.json();
  const summary = (body as { summary?: unknown }).summary;

  if (typeof summary !== "string") {
    throw new Error("The summary response was malformed.");
  }

  return summary;
}

/**
 * Compresses a finished cycle into the brief that opens the next one.
 *
 * The whole transcript goes up, which is the one request in the app that sends
 * everything at once. That is the point of it — the brief exists so the *next*
 * session never has to.
 */
export async function createCheatsheet(
  title: string,
  visits: StepVisit[],
  turns: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/cheatsheet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, visits, turns }),
    signal,
  });

  if (!response.ok) {
    await readError(response);
  }

  const body: unknown = await response.json();
  const cheatsheet = (body as { cheatsheet?: unknown }).cheatsheet;

  if (typeof cheatsheet !== "string" || cheatsheet.trim() === "") {
    throw new Error("The cheatsheet response was malformed.");
  }

  return cheatsheet;
}
