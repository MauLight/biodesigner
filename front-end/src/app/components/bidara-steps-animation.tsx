"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { IterationCw } from "lucide-react";

import { DESIGN_STEPS } from "@/lib/steps";
import type { DesignStep } from "@/lib/steps";

/** One named part of a step. `definition` is null where the source only labels it. */
export interface SubStepContent {
  label: string;
  definition: string | null;
}

/** What a step says. Written per step; the name and number are added below. */
export interface StepContent {
  /** The step's full name where it differs from the short one the UI shows. */
  fullName: string | null;
  definition: string;
  subSteps: SubStepContent[];
  /** Minimum content the step must produce. */
  floor: string;
  /** What the following step needs from it. Reads after "hands the next step ...". */
  handoff: string;
}

export interface SubStep extends SubStepContent {
  /** Position within its own step, from 1 — NASA's a–d and 1–6 as plain numbers. */
  id: number;
}

export interface StepDescription extends StepContent {
  /** Position in the process, from 1. */
  id: number;
  step: DesignStep;
  subSteps: SubStep[];
}

/**
 * The five steps of the Biomimicry Design Process, described.
 *
 * Two different sources here, and the difference matters if you edit this.
 *
 * `definition` and `subSteps` are condensed from NASA's PeTaL prompt
 * (`back-end/src/prompt.ts`), the authority on what each step *is*. `floor` and
 * `handoff` mirror `back-end/src/criteria.ts`, the authority on when a step is
 * *done* — the same strings BIDARA reads to decide whether to signal readiness and
 * the review reads to judge it afterward. They are copied rather than fetched
 * because the two folders are independent packages with nowhere to put a shared
 * module, the same compromise `lib/steps.ts` already makes. Change `criteria.ts`
 * and change these too, or the UI will promise a bar the model isn't using.
 *
 * Sub-step labels for Define and Abstract are NASA's own (a–d and 1–6). Biologize
 * and Discover have none in the source. Emulate's are ours — the source describes
 * it as unlabelled prose, so those labels name paragraphs rather than quote
 * headings.
 */
const STEP_CONTENT: Record<DesignStep, StepContent> = {
  Define: {
    fullName: null,
    definition:
      "Define the problem or opportunity the design should address. Work through the four parts below to arrive at a design question — and expect that question to be critiqued: too narrow presumes the solution, too broad leaves nothing to design against.",
    subSteps: [
      {
        label: "Frame your challenge",
        definition:
          "Give a simple explanation of the impact you want to have. Not what you want to make — what you want the design to achieve.",
      },
      {
        label: "Consider context",
        definition:
          "Describe the contextual factors that matter: stakeholders, location conditions, resource availability.",
      },
      {
        label: "Take a systems view",
        definition:
          "Look at the system surrounding the problem — its interactions, boundaries, and connections to other systems. This is where leverage points show up.",
      },
      {
        label: "Phrase your challenge as a question",
        definition:
          'A "How might we ___?" question that conveys context, the impact you want, and who benefits, while staying open-ended enough not to presuppose the answer.',
      },
    ],
    floor:
      "the challenge is stated as an outcome rather than an artifact, context and constraints are given, and the design question conveys context and impact without presupposing a solution",
    handoff: "a design question that can be reframed in biological terms",
  },
  Biologize: {
    fullName: null,
    definition:
      'Analyse the essential functions and context the challenge must address, then reframe them in biological terms so you can ask nature for advice. The output is one or more "How does nature...?" questions. Turning a question around widens the search: "How does nature repel liquids?" reaches the same mechanisms as "How does nature retain liquids?", because both are about controlling a liquid\'s movement.',
    subSteps: [],
    floor:
      'at least one "How does nature...?" question exists, together with one inverse or tangential variant',
    handoff: "questions specific enough to search with",
  },
  Discover: {
    fullName: null,
    definition:
      'Find natural models — organisms and ecosystems — that address the same functions and context as your design, and identify the strategies behind their survival. This step is research: generate as many sources of inspiration as you can, guided by your "How does nature...?" questions, looking across multiple species, ecosystems, and scales. Search academic papers and AskNature.',
    subSteps: [],
    floor:
      "at least three biological strategies, spanning more than one organism and more than one scale, with sources",
    handoff:
      "strategies described with enough mechanism to restate functionally",
  },
  Abstract: {
    fullName: null,
    definition:
      "A biological strategy is a characteristic, mechanism, or process an organism uses to meet a function. A bio-inspired design strategy states that same function and mechanism without biological terms — which is what makes it usable across disciplines. Consider function, form, material, surface, architecture, process, and system. A design strategy is not a statement about your solution; it is a launching pad for one.",
    subSteps: [
      {
        label: "Summarize the biological strategy",
        definition:
          "Distil the research into a concise statement of how the strategy meets the function. In a journal article, look to the abstract, conclusion, discussion, and introduction, in roughly that order of value.",
      },
      {
        label: "Draw the biological strategy",
        definition:
          "Sketch the features and mechanisms involved. Drawing alongside writing exposes gaps in your understanding that prose hides.",
      },
      {
        label: "Identify keywords and phrases",
        definition:
          'Underline the terms carrying the function and mechanism, then find discipline-neutral synonyms — "fibers" for "fur", "membrane" for "skin".',
      },
      {
        label: "Write the design strategy",
        definition:
          "Rewrite the strategy without biological terms but staying true to the science, addressing the function within the context it will be used.",
      },
      {
        label: "Draw the design strategy",
        definition:
          "Not a copy of the biology sketch — the biology-specific information is removed and only the functional elements remain. Draw it as a mechanical system or process diagram.",
      },
      {
        label: "Review the design strategy",
        definition:
          "Does it still carry the lesson from nature that drew you to the biological strategy? Does it give new insight, or merely validate what you already intended to build?",
      },
    ],
    floor:
      "each strategy restated in plain functional language containing no biological terms",
    handoff: "design strategies free of biological language",
  },
  Emulate: {
    fullName: "Emulate Nature's Lessons",
    definition:
      "Reconcile the previous four steps into a coherent, life-friendly design concept. Emulation is not rote copying: it captures the recipe in nature's example and models it in your own design — which means letting go of whatever you assumed the solution would be.",
    subSteps: [
      {
        label: "Group the strategies",
        definition:
          "List each inspiring organism with notes on its strategies, functions, and key features, then create categories grouping them by shared context, constraint, or mechanism. Look for patterns, and for the questions the groupings raise.",
      },
      {
        label: "Interrogate the groupings",
        definition:
          "How does context play a role? Are the strategies at the same scale or different ones — nano, micro, macro, meso? Are shapes, forms, or textures repeating? What behaviours, processes, and relationships are at play? Does information flow, and how?",
      },
      {
        label: "Return to the design question",
        definition:
          'Consider each abstracted strategy against the question from Define, asking "How can this strategy inform our design solution?" Write down every idea before analysing any of them.',
      },
      {
        label: "Develop design concepts",
        definition:
          "Turn the strategies into concepts. A visual understanding of problem and solution matters more here than anywhere else in the process.",
      },
      {
        label: "Check against Nature's Unifying Patterns",
        definition:
          "Nature uses only the energy it needs and relies on freely available energy; recycles all materials; is resilient to disturbances; optimises rather than maximises; provides mutual benefits; runs on information; uses chemistry safe for living beings; builds from abundant resources and uses rare ones sparingly; is locally attuned and responsive; and uses shape to determine functionality.",
      },
    ],
    floor:
      "at least one design concept that traces back to a named strategy, considered against Nature's Unifying Patterns",
    handoff: "a concept concrete enough to re-interrogate",
  },
};

/**
 * The same content, ordered and numbered for rendering.
 *
 * Order and ids come from `DESIGN_STEPS`, the module the session and the API both
 * agree on — not from the literal above. Nothing here restates a step's name as
 * data, so `Record<DesignStep, StepContent>` makes a missing, extra, or misspelled
 * step a compile error rather than a card that silently never lights.
 */
export const STEP_DESCRIPTIONS: StepDescription[] = DESIGN_STEPS.map(
  function describe(step, index): StepDescription {
    const content = STEP_CONTENT[step];

    return {
      ...content,
      id: index + 1,
      step,
      subSteps: content.subSteps.map((subStep, position) => ({
        ...subStep,
        id: position + 1,
      })),
    };
  },
);

/** How long each step holds the highlight. */
const HIGHLIGHT_MS = 4000;

/**
 * Every row is half the panel, and the cards fill it.
 *
 * The height authority is the row, not the card. Six cards in three columns is
 * two rows, so two halves are the whole panel and there is nothing left to
 * scroll — which is the point: a card that scrolls its own text inside a panel
 * that also scrolls gives the wheel two places to go.
 *
 * The subtraction is the one gap between those two rows. Percentages in a track
 * resolve against the grid's content box, which excludes padding but not gaps, so
 * without it two rows come to slightly more than the panel and it scrolls by
 * exactly the gap. `1.25rem` is `gap-5` on the grid below — change one and change
 * the other. Spelled out rather than interpolated because Tailwind generates
 * classes by reading this file, and a built string is not there to read.
 *
 * Below three columns the six cards need three or six rows and the panel does
 * scroll again. That is unavoidable, and it is the harmless direction: each card
 * is still half the panel and still readable at a glance.
 */
const ROW_TRACK = "auto-rows-[calc((100%-1.25rem)/2)]";

interface BidaraStepsAnimationProps {
  /**
   * Pin the highlight to one step. Omit it and the highlight cycles instead.
   *
   * The two modes answer different questions. With nothing underway, the panel is
   * an introduction and the walking highlight says "this is a sequence". Reopened
   * mid-session it is a reference, and the only step worth lighting is the one the
   * conversation is actually on — a highlight wandering off it would be telling the
   * user something untrue.
   */
  highlight?: DesignStep;
}

/**
 * The Biomimicry Design Process, laid out as cards.
 *
 * Hover is untouched in both modes: the highlight rides a `data-active` attribute
 * carrying the same colours, so pointing at a card lights it exactly as before and
 * both can be lit at once.
 */
export default function BidaraStepsAnimation({
  highlight,
}: BidaraStepsAnimationProps) {
  const [cycled, setCycled] = useState(0);
  const reduceMotion = useReducedMotion();

  const cycling = highlight === undefined;

  useEffect(() => {
    if (!cycling) {
      return;
    }

    const timer = window.setInterval(function advance(): void {
      setCycled((index) => (index + 1) % STEP_DESCRIPTIONS.length);
    }, HIGHLIGHT_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [cycling]);

  // Both branches index the same list, and `DesignStep` guarantees the pinned one
  // resolves — the record above cannot be missing a step.
  const active = cycling ? cycled : DESIGN_STEPS.indexOf(highlight);

  return (
    // Container queries, not viewport ones. This pane is half the window, so a
    // `lg:` breakpoint fires at twice the width that actually matters here — the
    // cards were being asked to hold three columns of prose inside 215 pixels.
    //
    // The row track owns the height — see `ROW_TRACK`. The percentage in it needs
    // a definite height to resolve against, which `h-full` on the grid supplies
    // all the way up from the pane.
    <div className="@container relative h-full w-full">
      <div
        className={`scrollbar-hide grid h-full w-full ${ROW_TRACK} grid-cols-1 gap-5 overflow-y-auto p-5 @md:grid-cols-2 @2xl:grid-cols-3`}
      >
        {STEP_DESCRIPTIONS.map((el, index) => (
          <StepCard
            key={el.id}
            description={el}
            active={index === active}
            reduceMotion={reduceMotion === true}
          />
        ))}
        {/* No `min-h`: the row is the height now, and a floor taller than the row
            would push the card back out of it. */}
        <div className="flex h-full flex-col items-start justify-start gap-y-1 overflow-hidden rounded-2xl bg-linear-to-b from-[#0d0d0d] to-box-dark p-6">
          <h1 className="font-medium text-[#898989] uppercase">Iterate</h1>
          <div className="flex h-full w-full items-center justify-center">
            <IterationCw className="h-10 w-10 text-teal-700" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface StepCardProps {
  description: StepDescription;
  /** Holding the timed highlight. Independent of hover, which still works. */
  active: boolean;
  reduceMotion: boolean;
}

/**
 * One step, as a card.
 *
 * The highlight rides on a `data-active` attribute rather than a computed class
 * string, so every element keeps its `group-hover:` colour and gains the identical
 * `group-data-[active=true]:` one. That is the only way to reuse hover values
 * verbatim — `group-hover:` can't be triggered from state — and it means the two
 * can never drift apart when one of them is edited.
 */
function StepCard({ description, active, reduceMotion }: StepCardProps) {
  return (
    <motion.div
      data-active={active}
      animate={{ scale: active && !reduceMotion ? 1.02 : 1 }}
      transition={{
        duration: reduceMotion ? 0 : 0.5,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="group flex h-full cursor-pointer flex-col items-start justify-start gap-y-1 overflow-hidden rounded-2xl border border-[#202020] bg-linear-to-b from-[#0d0d0d] to-box-dark p-6 transition-colors duration-500 hover:border-teal-950 hover:from-[#001214] data-[active=true]:border-teal-950 data-[active=true]:from-[#001214] data-[active=true]:to-[#000c0e]"
    >
      {/* Outside the scroller: which step you are reading is the one thing that
          must not scroll away. `shrink-0` because a flex item's default is to
          give up its own height before letting a sibling overflow. */}
      <h1 className="shrink-0 uppercase text-[#898989] group-hover:text-[#c9c9c9] group-data-[active=true]:text-[#c9c9c9] transition-colors duration-500 font-medium border-b mb-1.5">
        {description.step}
      </h1>

      {/* `min-h-0` is what makes this scroll at all — without it a flex child's
          floor is its content, so the card would grow past the cap instead. */}
      <div className="scrollbar-hide flex min-h-0 w-full flex-col items-start gap-y-1 overflow-y-auto">
        <p className="text-[0.75rem] text-[#696969] group-hover:text-[#b9b9b9] group-data-[active=true]:text-[#b9b9b9] transition-colors duration-500">
          {description.definition}
        </p>
        <div className="grid gap-1 mt-1.5">
          <p className="text-[0.75rem] text-[#898989] font-medium group-hover:text-[#c9c9c9] group-data-[active=true]:text-[#c9c9c9] transition-colors duration-500">
            Floor
          </p>
          <p className="text-[0.75rem] text-[#696969] group-hover:text-[#b9b9b9] group-data-[active=true]:text-[#b9b9b9] transition-colors duration-500">
            {description.floor}
          </p>
        </div>
        <div className="grid gap-1 mt-1.5">
          <p className="text-[0.75rem] text-[#898989] font-medium group-hover:text-[#c9c9c9] group-data-[active=true]:text-[#c9c9c9] transition-colors duration-500">
            Ceiling
          </p>
          <p className="text-[0.75rem] text-[#696969] group-hover:text-[#b9b9b9] group-data-[active=true]:text-[#b9b9b9] transition-colors duration-500">
            {description.handoff}.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
