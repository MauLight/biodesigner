"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Info } from "lucide-react";

interface MarkdownHintsProps {
  /** Only offered once there is something to format. */
  visible: boolean;
}

/** The handful worth knowing for writing up a challenge. */
const HINTS: ReadonlyArray<{ syntax: string; means: string }> = [
  { syntax: "**bold**", means: "emphasis" },
  { syntax: "- item", means: "bullet list" },
  { syntax: "1. item", means: "numbered list" },
  { syntax: "## Heading", means: "section" },
  { syntax: "[label](url)", means: "link" },
  { syntax: "`code`", means: "literal" },
];

/**
 * A floating Info button beside the composer, opening a panel of markdown hints.
 *
 * The button sits out in the column's padding rather than inside the field, so it
 * never competes with the text. The panel slides in from the left and aligns to
 * the composer's left edge, staying inside the column's padding.
 */
export default function MarkdownHints({ visible }: MarkdownHintsProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // Nothing to point at once the composer is empty again.
  //
  // Adjusted during render rather than in an effect. An effect would commit the
  // open panel first and close it on a second pass — a visible flash, and the
  // cascading render `react-hooks/set-state-in-effect` warns about. React
  // re-runs this component before touching the DOM instead.
  const [wasVisible, setWasVisible] = useState(visible);

  if (wasVisible !== visible) {
    setWasVisible(visible);

    if (!visible) {
      setOpen(false);
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      const container = containerRef.current;

      if (container !== null && !container.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleToggle(): void {
    setOpen((current) => !current);
  }

  const slide = reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, x: -24 };

  return (
    <div ref={containerRef}>
      <AnimatePresence>
        {visible && (
          <motion.button
            type="button"
            onClick={handleToggle}
            aria-label="Markdown formatting hints"
            aria-expanded={open}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute -left-10 bottom-0 flex h-12 w-6 cursor-pointer items-center justify-center text-faded-dark transition-colors duration-300 hover:text-text2"
          >
            <Info className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={slide}
            animate={{ opacity: 1, x: 0 }}
            exit={slide}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: "easeOut" }}
            className="absolute bottom-full left-0 z-20 mb-3 w-72 rounded-lg border-t border-border bg-[#191919] p-4 shadow-lg shadow-black/40"
          >
            <p className="mb-3 text-small text-text2">
              Formatting you can use
            </p>

            <dl className="flex flex-col gap-y-2">
              {HINTS.map((hint) => (
                <div
                  key={hint.syntax}
                  className="flex items-baseline justify-between gap-x-4"
                >
                  <dt>
                    <code className="rounded bg-black/40 px-1.5 py-0.5 text-small text-text2">
                      {hint.syntax}
                    </code>
                  </dt>
                  <dd className="text-small text-faded-dark">{hint.means}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-3 border-t border-border pt-3 text-small text-faded-dark">
              Shift + Enter for a new line.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
