"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════
   THE DEMO KIT
   The small vocabulary every walkthrough scene is written in: a field that
   fills itself, a pointer that moves like a hand, a pill that switches on,
   a ring that completes. Scenes compose these — they never write to the
   store, and they never show a control the real page does not have.
   ════════════════════════════════════════════════════════════════ */

/** The pane a scene is drawn in: the product's own glass, at demo scale. */
export function StageCard({
  children,
  className,
  title,
  hint,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  hint?: string;
}) {
  return (
    <div className={cn("relative flex h-full flex-col overflow-hidden rounded-[18px] border border-line/70 bg-card/85 p-3.5 shadow-soft", className)}>
      {(title || hint) && (
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          {title && <p className="text-[0.7rem] font-semibold tracking-[0.08em] text-paper/55 uppercase">{title}</p>}
          {hint && <p className="text-[0.68rem] text-paper/40">{hint}</p>}
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

/**
 * Text typed a character at a time, the way the demo forms fill. With motion
 * off it appears whole; the scene still reads, it just doesn't perform.
 */
export function TypingText({
  text,
  playing = true,
  className,
  speed = 26,
  caret = true,
}: {
  text: string;
  playing?: boolean;
  className?: string;
  /** Milliseconds per character. */
  speed?: number;
  caret?: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced || !playing ? text : "");

  useEffect(() => {
    if (reduced) {
      setShown(text);
      return;
    }
    if (!playing) {
      setShown(text);
      return;
    }
    setShown("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, playing, speed, reduced]);

  const done = shown.length >= text.length;
  return (
    <span className={className}>
      {shown}
      {caret && !done && playing && !reduced && <Caret />}
    </span>
  );
}

export function Caret() {
  return (
    <motion.span
      aria-hidden
      className="ml-0.5 inline-block h-[1em] w-[1.5px] translate-y-[0.12em] bg-accent"
      animate={{ opacity: [1, 1, 0, 0] }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    />
  );
}

/** A hand, moving to where the next tap lands. */
export function Pointer({
  x,
  y,
  click = false,
  className,
}: {
  /** Percent of the stage, 0–100. */
  x: number;
  y: number;
  click?: boolean;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.span
      aria-hidden
      className={cn("pointer-events-none absolute z-20 drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]", className)}
      initial={false}
      animate={{ left: `${x}%`, top: `${y}%`, scale: click ? [1, 0.86, 1] : 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 18, scale: { duration: 0.35 } }}
      style={{ position: "absolute", translate: "-18% -10%" }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4.5 2.8 19 12l-6.1 1.2 3.3 7.1-2.9 1.3-3.2-7.2L4.9 19 4.5 2.8Z" fill="rgb(var(--paper))" stroke="rgb(var(--card))" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      {click && !reduced && (
        <motion.span
          className="absolute left-1 top-1 block h-6 w-6 rounded-full border border-accent/70"
          initial={{ scale: 0.3, opacity: 0.9 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 0.5 }}
        />
      )}
    </motion.span>
  );
}

/** A form field being filled; `focus` gives it the ring a real one gets. */
export function DemoField({
  label,
  value,
  placeholder,
  focus = false,
  className,
  tone = "plain",
}: {
  label: string;
  value: React.ReactNode;
  placeholder?: string;
  focus?: boolean;
  className?: string;
  tone?: "plain" | "accent";
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[0.68rem] font-medium text-paper/55">{label}</span>
      <span
        className={cn(
          "flex min-h-8 items-center rounded-lg border px-2.5 py-1.5 text-[0.78rem] leading-snug",
          focus ? "border-accent/70 bg-accent/[0.07] shadow-[0_0_0_3px_rgb(var(--accent)/0.12)]" : "border-line/80 bg-card/60",
          tone === "accent" ? "text-accent-ink" : "text-paper/90",
        )}
      >
        {value || <span className="text-paper/35">{placeholder}</span>}
      </span>
    </label>
  );
}

/** A select, with the ring open only when the demo says so. */
export function DemoSelect({
  label,
  value,
  open = false,
  options = [],
}: {
  label: string;
  value: string;
  open?: boolean;
  options?: readonly string[];
}) {
  return (
    <div className="relative">
      <DemoField
        label={label}
        focus={open}
        value={
          <span className="flex w-full items-center justify-between gap-2">
            <span>{value}</span>
            <span aria-hidden className="text-paper/40">⌄</span>
          </span>
        }
      />
      {open && options.length > 0 && (
        <motion.ul
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-card/95 py-1 shadow-lift"
        >
          {options.map((option, index) => (
            <li
              key={option}
              className={cn(
                "px-2.5 py-1 text-[0.74rem]",
                index === 0 ? "bg-accent/12 text-accent-ink" : "text-paper/70",
              )}
            >
              {option}
            </li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}

export function DemoButton({
  children,
  primary = false,
  pressed = false,
  className,
}: {
  children: React.ReactNode;
  primary?: boolean;
  pressed?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.76rem] font-semibold",
        primary
          ? "bg-accent text-[rgb(var(--accent-fg))] shadow-[0_6px_18px_rgb(var(--accent)/var(--accent-glow))]"
          : "border border-line/80 bg-card/70 text-paper/80",
        pressed && "scale-[0.97]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A choice chip — moods, ratings, cadences. */
export function DemoChip({
  children,
  active = false,
  tone = "accent",
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  tone?: "accent" | "positive";
  className?: string;
}) {
  return (
    <motion.span
      animate={{ scale: active ? 1.02 : 1 }}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[0.7rem] font-medium",
        active
          ? tone === "positive"
            ? "border-[rgb(var(--positive)/0.5)] bg-[rgb(var(--positive)/0.16)] text-[rgb(var(--positive))]"
            : "border-accent/60 bg-accent/15 text-accent-ink"
          : "border-line/70 bg-card/50 text-paper/60",
        className,
      )}
    >
      {active && tone === "positive" && <Check className="h-2.5 w-2.5" aria-hidden />}
      {children}
    </motion.span>
  );
}

/** A habit or checklist cell, ticked or not. */
export function DemoCheck({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[0.72rem] text-paper/75">
      <span
        className={cn(
          "grid h-4 w-4 place-items-center rounded-[5px] border",
          checked ? "border-[rgb(var(--positive)/0.6)] bg-[rgb(var(--positive)/0.9)] text-white" : "border-line/80 bg-card/50",
        )}
      >
        {checked && <Check className="h-3 w-3" aria-hidden />}
      </span>
      {label}
    </span>
  );
}

/** A progress bar that eases to its value. */
export function DemoBar({
  value,
  tone = "accent",
  className,
}: {
  /** 0–1. */
  value: number;
  tone?: "accent" | "positive" | "warning";
  className?: string;
}) {
  const colour =
    tone === "positive" ? "rgb(var(--positive))" : tone === "warning" ? "rgb(var(--warning))" : "rgb(var(--accent))";
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-paper/10", className)}>
      <motion.span
        className="block h-full rounded-full"
        style={{ background: colour }}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ type: "spring", stiffness: 80, damping: 20 }}
      />
    </span>
  );
}

/** A small ring, for confidence and completion. */
export function DemoRing({ value, caption }: { value: number; caption: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const r = 18;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-2.5">
      <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden className="-rotate-90">
        <circle cx="23" cy="23" r={r} fill="none" stroke="rgb(var(--paper) / 0.12)" strokeWidth="4" />
        <motion.circle
          cx="23"
          cy="23"
          r={r}
          fill="none"
          stroke="rgb(var(--accent))"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference * (1 - pct) }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </svg>
      <div>
        <p className="text-[0.8rem] font-semibold text-paper/90">{Math.round(pct * 100)}%</p>
        <p className="text-[0.68rem] text-paper/50">{caption}</p>
      </div>
    </div>
  );
}

/**
 * A connection between this page and another: the arrow the walkthrough uses
 * wherever the product really hands data on.
 */
export function FlowLink({ label, active = true }: { label: string; active?: boolean }) {
  return (
    <motion.span
      initial={false}
      animate={{ opacity: active ? 1 : 0.45 }}
      className="inline-flex items-center gap-1 text-[0.68rem] font-medium text-accent-ink"
    >
      <CornerDownRight className="h-3 w-3" aria-hidden />
      {label}
    </motion.span>
  );
}

/** The caption under a scene, in the product's voice. */
export function StageNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-auto rounded-lg border border-line/60 bg-paper/[0.03] px-2 py-1.5 text-[0.68rem] leading-snug text-paper/55">
      {children}
    </p>
  );
}

/** Motion preference, read once per mount and kept current. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  const ref = useRef<MediaQueryList | null>(null);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    ref.current = mql;
    setReduced(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
