"use client";

import { useEffect, useRef } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";

/** One line of text at the composer's line-height, matching the old input. */
const MIN_HEIGHT = 48;

/** Roughly eight lines, after which the field scrolls instead of growing. */
const MAX_HEIGHT = 208;

/**
 * `block` matters here: a textarea is inline-block by default, so it sits on a
 * text baseline and leaves descender space below itself inside its wrapper —
 * which knocks it a few pixels out of alignment with the button beside it.
 */
const FIELD_CLASSES =
  "scrollbar-hide block w-full resize-none rounded-lg border-t border-border bg-[#191919] py-3 pl-3 pr-4 leading-6 text-dark2 shadow shadow-[#212121] outline-0 disabled:cursor-not-allowed disabled:opacity-50 dark:text-text2";

interface InputProps {
  /** Stable identity for the field. Not shown when `placeholder` overrides it. */
  label: string;
  /** Defaults to `label`. Used to narrate what the app is about to do. */
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

/**
 * The composer. A textarea rather than an input, because BIDARA asks for
 * structured answers — impact, context, constraints, a design question — and one
 * line makes that miserable to write.
 *
 * It starts a single line tall and grows with the content up to a cap, then
 * scrolls. The column is bottom-aligned once a conversation starts, so growth
 * pushes upward and the composer stays put.
 *
 * Enter sends, Shift+Enter breaks the line. Markdown typed here is rendered in
 * the transcript, so lists and emphasis survive.
 */
export default function Input({
  label,
  placeholder,
  value,
  onChange,
  onSubmit,
  disabled = false,
}: InputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Height has to be measured, not computed: it depends on wrapping, which
  // depends on the rendered width.
  useEffect(() => {
    const element = ref.current;

    if (element === null) {
      return;
    }

    element.style.height = "auto";
    element.style.height = `${Math.min(Math.max(element.scrollHeight, MIN_HEIGHT), MAX_HEIGHT)}px`;
  }, [value]);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    onChange(event.target.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter") {
      return;
    }

    // Shift+Enter is a newline. isComposing guards against submitting
    // mid-IME-composition, which would swallow the candidate selection.
    if (event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    onSubmit();
  }

  return (
    <div className="relative w-full">
      <textarea
        ref={ref}
        id={`${label} input`}
        name={label}
        rows={1}
        placeholder={placeholder ?? label}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoComplete="off"
        style={{ minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT }}
        className={FIELD_CLASSES}
      />
    </div>
  );
}
