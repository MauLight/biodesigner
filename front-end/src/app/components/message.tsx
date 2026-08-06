"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Turn } from "@/lib/session";

interface MessageProps {
  turn: Turn;
}

/**
 * One bubble in the transcript.
 *
 * Side and colour both encode the speaker, and neither bubble exceeds 90% of the
 * column so the alignment stays legible.
 *
 * Both sides render markdown. The composer is a textarea and BIDARA asks for
 * structured answers, so users do write lists and emphasis — leaving their turns
 * as plain text would show the raw syntax back to them. The user's bubble is dark,
 * so its prose needs inverting; BIDARA's is light and takes the default.
 *
 * `id` is the scroll target the ledger jumps to.
 */
export default function Message({ turn }: MessageProps) {
  const isUser = turn.role === "user";

  return (
    <div
      id={turn.id}
      className={`flex w-full scroll-mt-10 z-20 ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[90%] rounded-2xl px-5 py-4 ${
          isUser
            ? "bg-teal-950 text-[#e9e9e9] border border-green-950"
            : "bg-[#e9e9e9] text-black"
        }`}
      >
        <div
          className={`prose prose-sm max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-li:my-0.5 ${
            isUser
              ? "prose-invert prose-pre:bg-white/10"
              : "prose-pre:bg-black/5 prose-pre:text-black"
          }`}
        >
          <Markdown remarkPlugins={[remarkGfm]}>{turn.content}</Markdown>
          {turn.streaming && (
            <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-black align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}
