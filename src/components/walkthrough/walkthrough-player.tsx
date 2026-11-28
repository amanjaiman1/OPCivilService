"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMatchMedia, useMounted } from "@/lib/hooks";
import type { WalkthroughExperience } from "@/lib/walkthroughs/types";
import { useSpotlightRect, type SpotlightRect } from "./spotlight";
import { usePrefersReducedMotion } from "./demo-kit";

/* ════════════════════════════════════════════════════════════════
   THE PLAYER
   The whole screen while it runs: the real element lit where it exists,
   the authored film beside it, and one caption that says what is happening
   and why. It never writes to the app's data, and it leaves the page exactly
   as it found it on the way out.
   ════════════════════════════════════════════════════════════════ */

const CARD_WIDTH = 344;
const STAGE_WIDTH = 372;
const STAGE_HEIGHT = 236;
const GAP = 18;
const EDGE = 16;

interface PlayerProps {
  experience: WalkthroughExperience;
  step: number;
  completed: boolean;
  onStep: (step: number) => void;
  onFinish: () => void;
  onClose: () => void;
  onReplay: () => void;
}

interface Point {
  x: number;
  y: number;
}

/** Where the caption sits: beside the lit element, or centred when there is none. */
function captionSpot(rect: SpotlightRect | null, width: number, height: number, viewport: { w: number; h: number }, placement: string | undefined): Point {
  if (!rect) {
    return {
      x: Math.max(EDGE, (viewport.w - width) / 2),
      y: Math.max(EDGE, (viewport.h - height) / 2),
    };
  }
  const clampY = (y: number) => Math.max(EDGE, Math.min(y, viewport.h - height - EDGE));
  const centreY = rect.top + rect.height / 2 - height / 2;
  const rightX = rect.left + rect.width + GAP;
  const leftX = rect.left - width - GAP;
  const roomRight = rightX + width <= viewport.w - EDGE;
  const roomLeft = leftX >= EDGE;

  if (placement === "top") return { x: Math.max(EDGE, Math.min(rect.left + rect.width / 2 - width / 2, viewport.w - width - EDGE)), y: clampY(rect.top - height - GAP) };
  if (placement === "bottom") return { x: Math.max(EDGE, Math.min(rect.left + rect.width / 2 - width / 2, viewport.w - width - EDGE)), y: clampY(rect.top + rect.height + GAP) };
  if (placement === "right" && roomRight) return { x: rightX, y: clampY(centreY) };
  if (placement === "left" && roomLeft) return { x: leftX, y: clampY(centreY) };
  if (roomRight) return { x: rightX, y: clampY(centreY) };
  if (roomLeft) return { x: leftX, y: clampY(centreY) };
  // No side room: sit under the element, or over it when there is no room below.
  const below = rect.top + rect.height + GAP;
  return {
    x: Math.max(EDGE, Math.min(rect.left + rect.width / 2 - width / 2, viewport.w - width - EDGE)),
    y: clampY(below + height <= viewport.h ? below : rect.top - height - GAP),
  };
}

export function WalkthroughPlayer({ experience, step, completed, onStep, onFinish, onClose, onReplay }: PlayerProps) {
  const mounted = useMounted();
  const reduced = usePrefersReducedMotion();
  const overlay = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const steps = experience.steps;
  const last = steps.length - 1;
  const current = steps[Math.min(step, last)];

  const titleId = useId();
  const bodyId = useId();
  const announceId = useId();

  const rect = useSpotlightRect(current?.target, !completed, `${experience.id}:${step}`);
  const compact = useMatchMedia("(max-width: 719px)");
  const [viewport, setViewport] = useState({ w: 1280, h: 800 });

  useEffect(() => {
    const measure = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Focus enters the caption; the page under it keeps its own focus until then.
  useEffect(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = window.setTimeout(() => primary.current?.focus({ preventScroll: true }), 80);
    return () => {
      window.clearTimeout(id);
      returnFocus.current?.focus?.({ preventScroll: true });
    };
  }, []);

  // The page behind stays still while the walkthrough is over it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const next = useCallback(() => {
    if (completed) return;
    if (step >= last) onFinish();
    else onStep(step + 1);
  }, [completed, step, last, onFinish, onStep]);

  const back = useCallback(() => {
    if (step > 0) onStep(step - 1);
  }, [step, onStep]);

  // Keyboard: arrows move, Escape leaves, Tab stays within the player.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!overlay.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = overlay.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, back, onClose]);

  const cardHeight = compact ? 330 : 286;
  const spot = useMemo(
    () => (compact ? { x: EDGE, y: viewport.h - cardHeight - EDGE } : captionSpot(rect, CARD_WIDTH, cardHeight, viewport, current?.placement)),
    [compact, rect, viewport, current?.placement, cardHeight],
  );

  const stageSpot = useMemo(() => {
    if (compact) return null; // the stage sits inside the caption on a phone
    if (!rect) {
      return { x: Math.max(EDGE, (viewport.w - STAGE_WIDTH) / 2), y: Math.max(EDGE, (viewport.h - STAGE_HEIGHT) / 2 - 40) };
    }
    // Opposite corner to the caption, so the two never cover each other.
    const left = spot.x > viewport.w / 2;
    const below = spot.y > viewport.h / 2;
    return {
      x: left ? EDGE + 8 : viewport.w - STAGE_WIDTH - EDGE - 8,
      y: below ? EDGE + 8 : viewport.h - STAGE_HEIGHT - EDGE - 8,
    };
  }, [compact, rect, spot, viewport]);

  if (!mounted) return null;

  const transition = reduced ? { duration: 0 } : { type: "spring" as const, stiffness: 260, damping: 30 };

  return createPortal(
    <div ref={overlay} className="fixed inset-0 z-[70]" role="presentation">
      {/* The page, dimmed; the lit element is punched through by the hole below. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-[rgb(var(--scrim))]/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition }}
        onClick={onClose}
      />

      <AnimatePresence initial={false}>
        {rect && !completed && (
          <motion.div
            key="hole"
            aria-hidden
            className="pointer-events-none absolute rounded-[18px] border border-white/25"
            style={{ boxShadow: "0 0 0 9999px rgb(var(--scrim) / 0.72), 0 0 42px rgb(var(--accent) / 0.35)" }}
            initial={false}
            animate={{ left: rect.left - 8, top: rect.top - 8, width: rect.width + 16, height: rect.height + 16 }}
            transition={transition}
          />
        )}
      </AnimatePresence>

      {/* ── The caption ───────────────────────────────────────── */}
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={cn(
          "glass-overlay absolute flex flex-col overflow-hidden rounded-[20px] border border-line shadow-lift",
          compact ? "left-0 right-0 mx-3" : "",
        )}
        style={compact ? { bottom: EDGE, height: cardHeight } : { left: spot.x, top: spot.y, width: CARD_WIDTH }}
        initial={{ opacity: 0, y: reduced ? 0 : 10 }}
        animate={{ opacity: 1, y: 0, transition }}
        data-walkthrough-caption
      >
        <div className="flex items-center gap-2 border-b border-line/60 px-4 py-2.5">
          <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-paper/45 uppercase">
            {experience.title}
          </span>
          <span className="ml-auto text-[0.66rem] tabular-nums text-paper/45">
            {completed ? "Done" : `${Math.min(step, last) + 1} of ${steps.length}`}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-full text-paper/55 transition hover:bg-paper/10 hover:text-paper"
            aria-label="Close the walkthrough"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {compact && !completed && (
          <div className="border-b border-line/50 bg-paper/[0.02] px-3 py-2">
            <div className="h-[136px]">
              <experience.Stage step={step} playing={!reduced} />
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
          {completed ? (
            <>
              <p className="text-[0.66rem] font-semibold tracking-[0.1em] text-accent-ink uppercase">Walkthrough complete</p>
              <h2 id={titleId} className="text-[1rem] font-semibold leading-snug text-paper">
                You know this page now
              </h2>
              <p id={bodyId} className="text-[0.78rem] leading-relaxed text-paper/65">
                Replay it from the Tour button whenever you want a refresher. Nothing you entered during this walkthrough was saved to your account.
              </p>
            </>
          ) : (
            <>
              {current?.chapter && (
                <p className="text-[0.66rem] font-semibold tracking-[0.1em] text-accent-ink uppercase">{current.chapter}</p>
              )}
              <h2 id={titleId} className="text-[0.95rem] font-semibold leading-snug text-paper">
                {current?.title}
              </h2>
              <p id={bodyId} className="text-[0.78rem] leading-relaxed text-paper/65">
                {current?.body}
              </p>
              {current?.connection && (
                <p className="rounded-lg border border-accent/25 bg-accent/[0.07] px-2.5 py-1.5 text-[0.7rem] leading-snug text-accent-ink">
                  {current.connection}
                </p>
              )}
            </>
          )}
        </div>

        <div className="mt-auto flex items-center gap-2 border-t border-line/60 px-4 py-2.5">
          {completed ? (
            <>
              <button
                type="button"
                ref={primary}
                onClick={onReplay}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[0.74rem] font-semibold text-paper/75 transition hover:bg-paper/10"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Replay
              </button>
              <button
                type="button"
                onClick={onClose}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[0.74rem] font-semibold text-[rgb(var(--accent-fg))]"
              >
                <Check className="h-3.5 w-3.5" aria-hidden /> Done
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={back}
                disabled={step === 0}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[0.74rem] font-medium text-paper/60 transition enabled:hover:bg-paper/10 disabled:opacity-35"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
              </button>

              <div className="mx-auto flex items-center gap-1" aria-hidden>
                {steps.slice(0, 12).map((s, index) => (
                  <span
                    key={s.id}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      index === step ? "w-4 bg-accent" : index < step ? "w-1.5 bg-accent/50" : "w-1.5 bg-paper/20",
                    )}
                  />
                ))}
                {steps.length > 12 && <span className="ml-1 text-[0.62rem] tabular-nums text-paper/40">{steps.length}</span>}
              </div>

              <button
                type="button"
                ref={primary}
                onClick={next}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[0.74rem] font-semibold text-[rgb(var(--accent-fg))] shadow-[0_6px_18px_rgb(var(--accent)/var(--accent-glow))]"
              >
                {step >= last ? "Finish" : "Next"} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </>
          )}
        </div>
      </motion.div>

      {/* ── The film ──────────────────────────────────────────── */}
      {!compact && stageSpot && (
        <motion.div
          aria-hidden
          className="absolute overflow-hidden rounded-[20px] border border-line shadow-lift"
          style={{ left: stageSpot.x, top: stageSpot.y, width: STAGE_WIDTH, height: STAGE_HEIGHT }}
          initial={{ opacity: 0, scale: reduced ? 1 : 0.97 }}
          animate={{ opacity: 1, scale: 1, transition }}
        >
          <div className="h-full bg-card/90 p-3">
            <experience.Stage step={step} playing={!reduced} />
          </div>
        </motion.div>
      )}

      {/* Screen readers hear each step once, including on auto-advance. */}
      <p id={announceId} role="status" aria-live="polite" className="sr-only">
        {completed
          ? `${experience.title} walkthrough complete`
          : `Step ${Math.min(step, last) + 1} of ${steps.length}: ${current?.title}`}
      </p>
    </div>,
    document.body,
  );
}
