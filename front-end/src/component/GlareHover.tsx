import type { CSSProperties, ReactNode } from "react";

import "./GlareHover.css";

interface GlareHoverProps {
  width?: string;
  height?: string;
  background?: string;
  borderRadius?: string;
  borderColor?: string;
  children?: ReactNode;
  /** Hex only for `glareOpacity` to apply — see `toRgba`. */
  glareColor?: string;
  glareOpacity?: number;
  glareAngle?: number;
  /** Size of the gradient layer, as a percentage of the box. */
  glareSize?: number;
  /** How long one hover sweep takes, in milliseconds. */
  transitionDuration?: number;
  playOnce?: boolean;
  /** Sweep continuously instead of on hover. Supersedes hover and `playOnce`. */
  loop?: boolean;
  /** One full loop cycle including the pause, in milliseconds. */
  loopDuration?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Resolves the glare to an `rgba()` so `glareOpacity` can be folded in.
 *
 * Only hex is convertible. Anything else — a named colour, an existing `rgba()`,
 * a `var()` — is passed through untouched, which means `glareOpacity` is silently
 * ignored for it. Worth knowing before wondering why `"white"` at 0.2 looks solid.
 */
function toRgba(color: string, opacity: number): string {
  const hex = color.replace("#", "");

  if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  if (/^[0-9A-Fa-f]{3}$/.test(hex)) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  return color;
}

/**
 * A box with a band of light that crosses it.
 *
 * Every knob is a CSS custom property written onto the root; the component itself
 * animates nothing. Which of the three behaviours runs is a class:
 *
 * - default — the band tracks the pointer in and back out
 * - `playOnce` — no return transition, so it crosses and stays gone until re-entry
 * - `loop` — it crosses on its own, on `loopDuration`, ignoring the pointer
 *
 * `loop` wins outright where they overlap, because a CSS animation outranks the
 * transition the other two are built on. Setting both is not an error; it just
 * means the hover ones never get a say.
 */
export default function GlareHover({
  width = "500px",
  height = "500px",
  background = "#000",
  borderRadius = "10px",
  borderColor = "#333",
  children,
  glareColor = "#ffffff",
  glareOpacity = 0.5,
  glareAngle = -45,
  glareSize = 250,
  transitionDuration = 650,
  playOnce = false,
  loop = false,
  loopDuration = 3000,
  className = "",
  style = {},
}: GlareHoverProps) {
  // Custom properties are not part of `CSSProperties`, so the intersection is what
  // lets them sit in the same object as the caller's styles.
  const vars: CSSProperties & Record<string, string> = {
    "--gh-width": width,
    "--gh-height": height,
    "--gh-bg": background,
    "--gh-br": borderRadius,
    "--gh-angle": `${glareAngle}deg`,
    "--gh-duration": `${transitionDuration}ms`,
    "--gh-loop": `${loopDuration}ms`,
    "--gh-size": `${glareSize}%`,
    "--gh-rgba": toRgba(glareColor, glareOpacity),
    "--gh-border": borderColor,
  };

  const modes = [
    loop ? "glare-hover--loop" : "",
    playOnce ? "glare-hover--play-once" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`glare-hover ${modes} ${className}`}
      style={{ ...vars, ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}
