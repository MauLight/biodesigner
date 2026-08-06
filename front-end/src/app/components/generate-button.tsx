"use client";

import type { Status } from "@/lib/session";

interface GenerateButtonProps {
  status: Status;
  /** Nothing to send — empty input. Separate from the in-flight lock. */
  disabled?: boolean;
  onGenerate: () => void;
  onCancel: () => void;
}

/**
 * The submit control. Locked while a reply is streaming, since the session only
 * runs one turn at a time, and paired with a stop button in that state —
 * aborting the fetch also cancels the upstream OpenAI request.
 */
export default function GenerateButton({
  status,
  disabled = false,
  onGenerate,
  onCancel,
}: GenerateButtonProps) {
  const loading = status === "streaming";

  const color =
    status === "error"
      ? "bg-error text-text"
      : "bg-teal-800 text-text border-t border-teal-600";

  return (
    <div className="ml-5 flex shrink-0 items-center gap-x-2">
      <button
        type="button"
        onClick={onGenerate}
        disabled={loading || disabled}
        className={`${color} flex h-12 font-medium cursor-pointer items-center justify-center gap-x-2 whitespace-nowrap rounded-lg px-5 transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/40 border-t-current" />
        )}
        {loading ? "Generating" : "Generate"}
      </button>

      {loading && (
        <button
          type="button"
          onClick={onCancel}
          className="h-12 cursor-pointer whitespace-nowrap rounded-lg bg-border px-4 text-text2 transition-colors duration-300 hover:text-text"
        >
          Stop
        </button>
      )}
    </div>
  );
}
