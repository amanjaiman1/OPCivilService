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
    let active: HTMLElement | null = null;
    let cursor: { x: number; y: number } | null = null;
    let frame = 0;

    function clear() {
      active?.removeAttribute("data-spotlight-active");
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

      const bounds = hovered.getBoundingClientRect();
      hovered.style.setProperty("--spotlight-x", `${x - bounds.left}px`);
      hovered.style.setProperty("--spotlight-y", `${y - bounds.top}px`);
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
    return () => {
      root.removeEventListener("pointerover", move);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", reset);
      root.removeEventListener("pointercancel", reset);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("blur", reset);
      desktop.removeEventListener("change", reset);
      reset();
    };
  }, []);

  return <div ref={form} className={cn(styles.form, dialog && styles.dialog, className)}>{children}</div>;
}
