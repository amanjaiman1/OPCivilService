"use client";

import { useEffect, useState } from "react";

/** A viewport rectangle, in CSS pixels, of the element a step lights up. */
export interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Tracks the real element a step points at. The rect follows scrolling,
 * resizing and the element's own size, and clears when the element is not on
 * the page — the player then centres its stage instead of lighting nothing.
 */
export function useSpotlightRect(
  selector: string | undefined,
  active: boolean,
  stepKey: string,
): SpotlightRect | null {
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  useEffect(() => {
    if (!active || !selector) {
      setRect(null);
      return;
    }

    let frame = 0;
    let last = "";

    const measure = () => {
      const el = document.querySelector(selector);
      if (!(el instanceof HTMLElement)) {
        if (last !== "none") {
          last = "none";
          setRect(null);
        }
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) {
        if (last !== "none") {
          last = "none";
          setRect(null);
        }
        return;
      }
      const next: SpotlightRect = { top: r.top, left: r.left, width: r.width, height: r.height };
      const key = `${Math.round(next.top)}:${Math.round(next.left)}:${Math.round(next.width)}:${Math.round(next.height)}`;
      if (key !== last) {
        last = key;
        setRect(next);
      }
    };

    // Bring the element into view first — a step should never be spoken about
    // off screen — then keep measuring while the page settles.
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }

    measure();
    const onFrame = () => {
      measure();
      frame = requestAnimationFrame(onFrame);
    };
    // A short burst of frames covers smooth scrolling; the listeners below
    // keep it correct afterwards without a permanent animation loop.
    let burst = 0;
    const burstStep = () => {
      measure();
      burst += 1;
      if (burst < 60) frame = requestAnimationFrame(burstStep);
    };
    frame = requestAnimationFrame(burstStep);

    const observer = new ResizeObserver(() => measure());
    observer.observe(document.documentElement);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [selector, active, stepKey]);

  return rect;
}
