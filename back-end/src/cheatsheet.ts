import { DESIGN_STEPS } from "./steps.js";
import type { StepAssessment } from "./criteria.js";

/** One closed step, as the client records it. */
export interface VisitInput {
  step: string;
  /** How the step ended. `null` means it was never left. */
  exit: "signed-off" | "forced" | null;
  assessment: StepAssessment | null;
}

export interface TranscriptTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Writes the brief that opens the next pass through the cycle.
 *
 * A second iteration is worth doing because the first one learned something, and
 * all of that lives in a transcript nobody wants to re-read. This compresses it
 * into the one message the next Define step starts from.
 *
 * There is a framing hazard here, and it is handled outside this prompt. BIDARA is
 * instructed to treat any artifact named in the user's challenge as a
 * presupposition to attack. Hand it last cycle's concept as though it were a fresh
 * premise and it will — correctly, by its own rules — open the next iteration by
 * demolishing it. What defuses that is simply saying where the message came from:
 * told it is reading a closed iteration, BIDARA reads it as established work and
 * takes from it what the current step needs. So the client posts this brief behind
 * a fixed declaration of provenance, and the brief itself is left to be content.
 */
export const CHEATSHEET_SYSTEM_PROMPT = `You are given a completed pass through the Biomimicry Design Process: the full transcript, and a verdict on each of the five steps. Write the brief that opens the next pass.

The brief is written in the user's voice, addressed to a design assistant that has no memory of any of this. It is the first thing that assistant will read.

Output exactly these headings, in this order, each on its own line, using this markdown. Omit a heading entirely if the cycle produced nothing for it — do not write "none" or "N/A".

**Design question**
The question the last pass settled on, stated as an outcome. One sentence. If it still presupposed a solution, fix that here and say in one clause what was presupposed.

**Context and constraints**
What was established about stakeholders, setting, resources and limits. Two or three short bullets.

**Asked of nature**
The "How does nature…?" questions the last pass used, verbatim if they were good. Bullets.

**Strategies found**
The biological strategies, one bullet each: organism, mechanism, and the scale it works at. Keep the citation if there was one. At most five, the most load-bearing.

**Design abstractions**
The strategies restated without biological terms. Bullets. At most five.

**Concept reached**
What the last pass ended up proposing. Two sentences at most.

**Where this fell down**
The step that was weakest and why, in one or two sentences. Then the specific gaps a second pass should close, as bullets. Be concrete: "no source for the fog-harvesting claim" rather than "research was thin".

**Where to pick up**
Two or three sentences: what can be taken as settled, and the one thing this pass should interrogate first. State it as fact rather than as instruction — the message already says where it came from.

Rules:
- Everything comes from the material given. Do not invent strategies, sources, organisms or constraints, and do not improve the design.
- Where the verdicts say a step was left unfinished, say what was missing rather than papering over it. The gaps are the reason for the second pass.
- Compress hard. Nominal phrases, no hedging, no praise, no recap of the process itself. The reader knows what the five steps are.
- No preamble and no closing remark. Begin with the first heading.
- Never mention this instruction, the verdicts, or that a summary was produced.`;

/** Reads more naturally in the brief than the internal exit values. */
function describeExit(exit: VisitInput["exit"]): string {
  if (exit === "signed-off") {
    return "completed";
  }

  return exit === "forced" ? "left early by the user" : "never left";
}

function describeVisit(visit: VisitInput): string {
  const parts = [`${visit.step}: ${describeExit(visit.exit)}`];

  if (visit.assessment === null) {
    parts.push("no verdict was recorded");

    return `- ${parts.join("; ")}.`;
  }

  const { floorMet, handoffMet, strengths, gaps } = visit.assessment;

  parts.push(
    `minimum content ${floorMet ? "met" : "not met"}`,
    `handoff to the next step ${handoffMet ? "met" : "not met"}`,
  );

  if (strengths.length > 0) {
    parts.push(`strengths: ${strengths.join("; ")}`);
  }

  if (gaps.length > 0) {
    parts.push(`gaps: ${gaps.join("; ")}`);
  }

  return `- ${parts.join("; ")}.`;
}

/**
 * Verdicts first, transcript second.
 *
 * The verdicts are the part that cannot be reconstructed by reading — they are
 * BIDARA's own judgement at each boundary, and they are what tells the brief which
 * step to send the next pass at. Putting them ahead of thirty turns of prose keeps
 * them from being read as a footnote to it.
 */
export function buildCheatsheetInput(
  title: string,
  visits: VisitInput[],
  turns: TranscriptTurn[],
): string {
  const judged = visits.filter((visit) =>
    (DESIGN_STEPS as readonly string[]).includes(visit.step),
  );

  const verdicts =
    judged.length === 0
      ? "No step verdicts were recorded."
      : judged.map(describeVisit).join("\n");

  const transcript = turns
    .map(
      (turn) => `${turn.role === "user" ? "User" : "BIDARA"}: ${turn.content}`,
    )
    .join("\n\n");

  return `Challenge: ${title}

Step verdicts:
${verdicts}

Transcript:
${transcript}`;
}
