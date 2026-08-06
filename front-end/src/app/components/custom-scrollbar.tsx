"use client";

import { useEffect, useRef, useState } from "react";

/** Never shrink below this, or a long list leaves nothing to grab. */
const MIN_THUMB = 24;

interface CustomScrollbarProps {
  /**
   * The scroll container. Typed as `HTMLElement` rather than a specific tag —
   * only `scrollTop`/`scrollHeight`/`clientHeight` are touched, and callers pass
   * lists as often as divs.
   */
  scrollRef: React.RefObject<HTMLElement | null>;
}

/**
 * A minimal scrollbar standing in for the native one.
 *
 * The container hides its own (`scrollbar-hide`) and this renders as a sibling
 * inside a `relative` wrapper, sitting at `-right-4`. Whether it appears at all is
 * the parent's call — render it only when the container actually overflows,
 * otherwise it draws a full-height thumb over content that cannot move.
 */
export default function CustomScrollbar({ scrollRef }: CustomScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startScroll: number } | null>(null);
  // Cancels both drag listeners at once. They cannot be removed by reference:
  // this component re-renders on every scroll event, so by the time the drag
  // ends the handler identities have changed and `removeEventListener` would be
  // handed functions that were never added — leaving the drag stuck to the
  // pointer after release.
  const dragCleanupRef = useRef<AbortController | null>(null);
  const [thumb, setThumb] = useState({ height: 0, top: 0 });

  useEffect(() => {
    const element = scrollRef.current;

    if (element === null) {
      return;
    }

    function syncThumb(): void {
      const track = trackRef.current;

      if (element === null || track === null) {
        return;
      }

      const { scrollHeight, clientHeight, scrollTop } = element;
      const trackHeight = track.clientHeight;
      const thumbHeight = Math.max(
        (clientHeight / scrollHeight) * trackHeight,
        MIN_THUMB,
      );
      const maxScroll = scrollHeight - clientHeight;
      const maxTravel = trackHeight - thumbHeight;

      setThumb({
        height: thumbHeight,
        // Both guards matter: content shorter than the box gives maxScroll 0, and
        // a track barely taller than the minimum thumb gives maxTravel 0.
        top:
          maxScroll > 0 && maxTravel > 0
            ? (scrollTop / maxScroll) * maxTravel
            : 0,
      });
    }

    syncThumb();
    element.addEventListener("scroll", syncThumb);

    // Watches the container's box. Content that grows without resizing the box
    // won't fire this, so a list that changes length should be remounted or keyed.
    const observer = new ResizeObserver(syncThumb);
    observer.observe(element);

    return () => {
      element.removeEventListener("scroll", syncThumb);
      observer.disconnect();
    };
  }, [scrollRef]);

  // Torn down on unmount too: releasing outside the window, or the parent hiding
  // the scrollbar mid-drag, would otherwise leave the listeners attached.
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.abort();
    };
  }, []);

  function handleDragStart(event: React.PointerEvent): void {
    const element = scrollRef.current;

    if (element === null) {
      return;
    }

    dragRef.current = { startY: event.clientY, startScroll: element.scrollTop };

    const controller = new AbortController();
    dragCleanupRef.current = controller;

    function handleDragMove(moveEvent: PointerEvent): void {
      const track = trackRef.current;
      const drag = dragRef.current;

      if (element === null || track === null || drag === null) {
        return;
      }

      const { scrollHeight, clientHeight } = element;
      const thumbHeight = Math.max(
        (clientHeight / scrollHeight) * track.clientHeight,
        MIN_THUMB,
      );
      const maxTravel = track.clientHeight - thumbHeight;

      if (maxTravel <= 0) {
        return;
      }

      const maxScroll = scrollHeight - clientHeight;
      const deltaY = moveEvent.clientY - drag.startY;

      // Thumb pixels to scroll pixels, scaled by the distance each can travel.
      element.scrollTop = drag.startScroll + deltaY * (maxScroll / maxTravel);
    }

    function handleDragEnd(): void {
      dragRef.current = null;
      controller.abort();
      dragCleanupRef.current = null;
    }

    window.addEventListener("pointermove", handleDragMove, {
      signal: controller.signal,
    });
    window.addEventListener("pointerup", handleDragEnd, {
      signal: controller.signal,
    });
    window.addEventListener("pointercancel", handleDragEnd, {
      signal: controller.signal,
    });

    event.preventDefault();
  }

  return (
    <div
      ref={trackRef}
      className="absolute top-0 -right-4 z-50 h-full w-2.5 rounded-full bg-gray-200 dark:bg-[#ededed]/10"
    >
      <div
        onPointerDown={handleDragStart}
        style={{
          height: thumb.height,
          transform: `translateY(${thumb.top}px)`,
        }}
        // `touch-none` stops a drag on a touchscreen scrolling the page instead.
        className="w-full cursor-grab touch-none rounded-full bg-gray-300 active:cursor-grabbing dark:bg-[#171717]"
      />
    </div>
  );
}
