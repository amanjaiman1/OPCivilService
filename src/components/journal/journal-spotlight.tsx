"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./journal-spotlight.module.css";

export function JournalSpotlight({ children, className, dialog = false }: {
  children: ReactNode;
  className?: string;
  dialog?: boolean;
}) {
  const form = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = form.current;
    if (!root) return;

    const desktop = window.matchMedia("(min-width: 1024px) and (any-hover: hover) and (any-pointer: fine)");
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
    let active: HTMLElement | null = null;
    let cursor: { x: number; y: number } | null = null;
    let frame = 0;

    function clear() {
      if (active) {
        active.removeAttribute("data-spotlight-active");
        active.style.removeProperty("--journal-tilt-x");
        active.style.removeProperty("--journal-tilt-y");
      }
      active = null;
    }

    function draw() {
      frame = 0;
      if (!cursor) return;
      const { x, y } = cursor;
      const hovered = document.elementFromPoint(x, y)?.closest<HTMLElement>(`.${styles.section}`);
      if (!hovered || !root?.contains(hovered)) {
        clear();
        return;
      }

      // Only the decorative layers tilt, so this section stays a stable hit target.
      if (motion.matches) {
        const { left, top, width, height } = hovered.getBoundingClientRect();
        const horizontal = Math.max(-1, Math.min(1, (2 * (x - left)) / width - 1));
        const vertical = Math.max(-1, Math.min(1, (2 * (y - top)) / height - 1));
        hovered.style.setProperty("--journal-tilt-x", `${-vertical * 6}deg`);
        hovered.style.setProperty("--journal-tilt-y", `${horizontal * 6}deg`);
      }
      if (hovered !== active) {
        clear();
        active = hovered;
        hovered.setAttribute("data-spotlight-active", "");
      }
    }

    function schedule() {
      if (cursor && !frame) frame = requestAnimationFrame(draw);
    }

    function move(event: PointerEvent) {
      if (!desktop.matches || event.pointerType !== "mouse") {
        reset();
        return;
      }
      cursor = { x: event.clientX, y: event.clientY };
      schedule();
    }

    function reset() {
      cursor = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      clear();
    }

    root.addEventListener("pointerover", move);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerleave", reset);
    root.addEventListener("pointercancel", reset);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("blur", reset);
    desktop.addEventListener("change", reset);
    motion.addEventListener("change", reset);
    return () => {
      root.removeEventListener("pointerover", move);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", reset);
      root.removeEventListener("pointercancel", reset);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("blur", reset);
      desktop.removeEventListener("change", reset);
      motion.removeEventListener("change", reset);
      reset();
    };
  }, []);

  return <div ref={form} className={cn(styles.form, dialog && styles.dialog, className)}>{children}</div>;
}
