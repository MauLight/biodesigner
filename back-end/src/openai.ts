import OpenAI, { APIError } from "openai";

import { config } from "./config.js";
import {
  BIDARA_SYSTEM_PROMPT,
  BIDARA_BEHAVIOR_ADDENDUM,
  buildStepContext,
} from "./prompt.js";
import {
  SUMMARIZER_SYSTEM_PROMPT,
  buildSummarizerInput,
} from "./summarizer.js";
import type { Speaker } from "./summarizer.js";
import type { DesignStep } from "./steps.js";

const client = new OpenAI({ apiKey: config.openaiApiKey });

export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

const SYSTEM_PROMPT = `${BIDARA_SYSTEM_PROMPT}\n\n${BIDARA_BEHAVIOR_ADDENDUM}`;

/**
 * The long prompt goes first and never varies, so it stays a cacheable prefix.
 * The per-turn step context follows it as a second system message.
 */
function withSystemPrompt(
  messages: ChatMessage[],
  step: DesignStep,
  forced: boolean,
) {
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "system" as const, content: buildStepContext(step, forced) },
    ...messages,
  ];
}

/**
 * Reasoning models spend their whole output budget thinking before they emit a
 * character, which for a one-line summary is pure waste — gpt-5-nano burned 500
 * tokens on reasoning and returned nothing. `reasoning_effort: "minimal"` fixes
 * that, but non-reasoning models reject the argument with a 400.
 *
 * Rather than sniff model names, we send it, and if the model objects we
 * remember that and stop sending it. One wasted round trip per process, never
 * per request.
 */
let summaryModelTakesReasoningEffort = true;

function rejectedReasoningEffort(error: unknown): boolean {
  return (
    error instanceof APIError &&
    error.status === 400 &&
    typeof error.message === "string" &&
    error.message.includes("reasoning_effort")
  );
}

function cleanSummary(raw: string | null | undefined): string {
  if (raw === undefined || raw === null || raw.trim() === "") {
    throw new Error("The model returned an empty summary.");
  }

  // Collapse to a single line, drop quotes the model may have added, and make
  // sure the sentence is terminated — minimal-effort output sometimes isn't.
  const summary = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();

  return /[.!?]$/.test(summary) ? summary : `${summary}.`;
}

/**
 * Compresses one turn into a ledger sentence. Deliberately not streamed: the
 * output is one line, and the front-end wants it whole or not at all.
 */
export async function summarize(
  text: string,
  speaker: Speaker,
): Promise<string> {
  const request = {
    model: config.openaiSummaryModel,
    max_completion_tokens: 1000,
    messages: [
      { role: "system" as const, content: SUMMARIZER_SYSTEM_PROMPT },
      { role: "user" as const, content: buildSummarizerInput(text, speaker) },
    ],
  };

  if (summaryModelTakesReasoningEffort) {
    try {
      const completion = await client.chat.completions.create({
        ...request,
        reasoning_effort: "minimal",
      });

      return cleanSummary(completion.choices[0]?.message.content);
    } catch (error) {
      if (!rejectedReasoningEffort(error)) {
        throw error;
      }

      summaryModelTakesReasoningEffort = false;
      console.log(
        `${config.openaiSummaryModel} does not accept reasoning_effort; omitting it from now on.`,
      );
    }
  }

  const completion = await client.chat.completions.create(request);

  return cleanSummary(completion.choices[0]?.message.content);
}

/**
 * Sends the conversation with BIDARA prepended and returns the reply in one
 * piece. Kept for `stream: false`, which is mostly useful for curl and tests.
 */
export async function generateReply(
  messages: ChatMessage[],
  step: DesignStep,
  forced: boolean,
): Promise<string> {
  const completion = await client.chat.completions.create({
    model: config.openaiModel,
    messages: withSystemPrompt(messages, step, forced),
  });

  const reply = completion.choices[0]?.message.content;

  if (reply === undefined || reply === null || reply.trim() === "") {
    throw new Error("The model returned an empty response.");
  }

  return reply;
}

/**
 * Same call, yielded token by token. The `create()` request is only issued when
 * the first value is pulled, so a failure to reach OpenAI surfaces as a thrown
 * error before any content exists — which lets the route still send a real HTTP
 * status instead of a half-written stream.
 */
export async function* streamReply(
  messages: ChatMessage[],
  step: DesignStep,
  forced: boolean,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const stream = await client.chat.completions.create(
    {
      model: config.openaiModel,
      messages: withSystemPrompt(messages, step, forced),
      stream: true,
    },
    { signal },
  );

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;

    if (delta !== undefined && delta !== null && delta !== "") {
      yield delta;
    }
  }
}
