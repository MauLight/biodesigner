// @ts-nocheck
"use client";

import DotField from "@/component/DotField";
import { useSession } from "@/lib/session";
import { motion } from "motion/react";

/**
 * `pointer-events-none` on the wrapper is load-bearing. This overlay covers the
 * whole column and Generation is a sibling, not an ancestor — so a wheel event
 * landing here can never reach the transcript's scroll container, and the chat
 * silently stops scrolling. DotField tracks the mouse on `window`, so it still
 * reacts with pointer events off.
 */
export default function GenerationBg() {
  const { started } = useSession();

  if (!started) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: 0.8,
      }}
      className="absolute top-0 left-0 w-full h-full pointer-events-none z-0"
    >
      <div className="absolute top-0 left-0 w-full h-full bg-linear-to-r from-black via-teal-800 to-indigo-800 animated-background opacity-10" />
      <DotField
        dotRadius={1.5}
        dotSpacing={14}
        bulgeStrength={0}
        glowRadius={0}
        sparkle={true}
        waveAmplitude={0}
        cursorRadius={0}
        cursorForce={0}
        gradientFrom="#292929"
        gradientTo="#595959"
        glowColor="#120F17"
      />
    </motion.div>
  );
}
