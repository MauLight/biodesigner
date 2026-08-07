"use client";

import { motion } from "motion/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import "./StarBorder.css";

interface StarBorderProps extends ComponentPropsWithoutRef<typeof motion.div> {
  /** Colour of the travelling light. Any CSS colour. */
  color?: string;
  /** How long one pass takes, as a CSS duration. */
  speed?: string;
  /** Height of the gap the light runs through, in pixels. */
  thickness?: number;
  /** Styles the surface the light runs around, if the child is not one already. */
  innerClassName?: string;
  children?: ReactNode;
}

/**
 * A frame that runs a sweep of light around its contents.
 *
 * A frame, not a button. The original wrapped its children in a styled surface of
 * its own and rendered a `<button>` by default, which meant using it around a real
 * button produced a button inside a button — invalid markup, and the outer one
 * swallowing the padding and colours of the inner.
 *
 * So the child is the surface. Give it an opaque background and the same radius as
 * the frame; the frame clips to that radius and the light shows only in the gap
 * `thickness` opens above and below it.
 *
 * It is a `motion.div`, so it can be an `AnimatePresence` child in its own right —
 * put the `key` and the enter/exit props here rather than on whatever it wraps,
 * which is out of reach from the outside.
 */
export default function StarBorder({
  color = "white",
  speed = "6s",
  thickness = 1,
  className = "",
  innerClassName = "",
  children,
  style,
  ...rest
}: StarBorderProps) {
  // One object for both sweeps — they differ only in the direction they run,
  // which is the animation's business.
  const light = {
    background: `radial-gradient(circle, ${color}, transparent 10%)`,
    animationDuration: speed,
  };

  return (
    <motion.div
      className={`star-border-container ${className}`}
      style={{ padding: `${thickness}px 0`, ...style }}
      {...rest}
    >
      <div className="star-border-bottom" style={light} />
      <div className="star-border-top" style={light} />
      <div className={`star-border-content ${innerClassName}`}>{children}</div>
    </motion.div>
  );
}
