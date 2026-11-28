"use client";

import { ArrowRight, BookMarked, CalendarClock, RotateCcw } from "lucide-react";
import {
  DemoButton,
  DemoChip,
  DemoField,
  DemoSelect,
  Pointer,
  StageCard,
  StageNote,
  TypingText,
} from "../demo-kit";
import type { WalkthroughExperience, WalkthroughStep } from "@/lib/walkthroughs/types";

/* ════════════════════════════════════════════════════════════════
   REVISION
   Spaced repetition that reads your own recall. The ladder is a real
   constant — 1, 3, 7, 14, 30, 60 days — and a remembered pass moves an item
   one rung, while a forgotten one puts it back at the start.
   ════════════════════════════════════════════════════════════════ */

const steps: readonly WalkthroughStep[] = [
  {
    id: "queue",
    chapter: "Chapter 1 · The queue",
    title: "Three buckets, one honest answer",
    body: "Overdue, due today, and what is coming. The page never hides a late item behind a tidy count — the overdue bucket is the first thing you see.",
    target: "[data-revision-buckets]",
    connection: "Reads every revision item the syllabus and journal have scheduled.",
    placement: "bottom",
  },
  {
    id: "add",
    chapter: "Chapter 2 · Adding an item",
    title: "Name the topic, not the chapter",
    body: "An item is a topic you want to recall. Linking it to the syllabus lets the same card credit the topic's confidence when you pass it.",
    target: "[data-revision-add]",
    connection: "A linked topic gains recall credit as the item advances.",
    placement: "bottom",
  },
  {
    id: "confidence",
    chapter: "Chapter 3 · Confidence, 1 to 5",
    title: "A judgement, kept with the date",
    body: "Confidence is your own reading of the topic when you last touched it, not a score the app invents. The chart on the page is the average of exactly that.",
    target: "[data-revision-confidence]",
    connection: "Feeds the subject's tone on Subject Progress.",
    placement: "top",
  },
  {
    id: "review",
    chapter: "Chapter 4 · Where reviews happen",
    title: "You review where you already are",
    body: "The journal's revision picker asks whether you remembered the item. Answering there advances it; you never need to open this page to do the work.",
    connection: "Journal → revision interval and topic confidence.",
    placement: "center",
  },
  {
    id: "ladder",
    chapter: "Chapter 5 · The ladder",
    title: "Remembered moves down the ladder",
    body: "A pass moves the item one rung: 1, 3, 7, 14, 30, 60 days. A miss puts it back to 1 day, because the point is to see it again while it is still weak.",
    connection: "The next due date is written from today, not from the old date.",
    placement: "center",
  },
  {
    id: "edit",
    chapter: "Chapter 6 · When life moves",
    title: "Dates are yours to correct",
    body: "Editing an item can bring the next due date forward or push it back. The page shows how many successful recalls the item has had, so a correction is never blind.",
    target: "[data-revision-buckets]",
    connection: "Edits sync like everything else, from any device.",
    placement: "top",
  },
];

const scenes: Record<string, (playing: boolean) => React.ReactNode> = {
  queue: () => (
    <StageCard title="Revision" hint="due now">
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { label: "Overdue", count: 6, tone: "warning" },
          { label: "Due today", count: 9, tone: "accent" },
          { label: "Next 7 days", count: 14, tone: "muted" },
        ].map((bucket) => (
          <div key={bucket.label} className="rounded-lg border border-line/60 bg-card/50 px-1.5 py-2 text-center">
            <p className={`text-[0.95rem] font-semibold tabular-nums ${bucket.tone === "warning" ? "text-[rgb(var(--warning))]" : "text-paper/85"}`}>
              {bucket.count}
            </p>
            <p className="text-[0.6rem] text-paper/45">{bucket.label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-line/60 bg-card/45 px-2 py-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.7rem] text-paper/80">Federalism · Polity</span>
          <DemoChip>due today</DemoChip>
        </div>
      </div>
      <Pointer x={20} y={40} />
    </StageCard>
  ),
  add: (playing) => (
    <StageCard title="Add item" hint="a topic to recall">
      <DemoSelect label="Subject" value="Polity" open />
      <DemoField label="Topic" value={<TypingText text="Federalism" playing={playing} />} />
      <div className="grid grid-cols-2 gap-1.5">
        <DemoField label="Next due" value="26 Nov" />
        <DemoField label="Confidence" value="★★★☆☆" />
      </div>
      <div className="mt-1 flex justify-end">
        <DemoButton primary pressed={playing}>Add item</DemoButton>
      </div>
    </StageCard>
  ),
  confidence: (playing) => (
    <StageCard title="Confidence" hint="your reading, by date">
      <div className="flex items-end gap-1.5">
        {[2, 3, 3, 4, 4, 5, 5].map((value, index) => (
          <div key={index} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-accent/70"
              style={{ height: `${value * 12}px`, opacity: playing ? 1 : 0.4, transition: "opacity 300ms" }}
            />
            <span className="text-[0.52rem] text-paper/35">{index + 1}</span>
          </div>
        ))}
      </div>
      <DemoField label="Confidence today" value="★★★★★" focus />
      <StageNote>The chart is the average of these readings, nothing more.</StageNote>
    </StageCard>
  ),
  review: () => (
    <StageCard title="Journal · revision picker" hint="answer here">
      <div className="flex items-center justify-between rounded-lg border border-line/60 bg-card/50 px-2.5 py-2">
        <span className="text-[0.72rem] text-paper/80">Federalism · Polity</span>
        <span className="text-[0.62rem] text-paper/40">due today</span>
      </div>
      <div className="flex gap-1.5">
        <DemoChip active tone="positive">Remembered</DemoChip>
        <DemoChip>Forgotten</DemoChip>
      </div>
      <Pointer x={26} y={62} click />
    </StageCard>
  ),
  ladder: (playing) => (
    <StageCard title="The ladder" hint="days between reviews">
      <div className="flex items-center justify-between px-1">
        {[1, 3, 7, 14, 30, 60].map((days, index) => (
          <div key={days} className="flex flex-col items-center gap-1">
            <span
              className={`grid h-8 w-8 place-items-center rounded-full border text-[0.66rem] font-semibold tabular-nums ${
                index <= (playing ? 3 : 1) ? "border-accent bg-accent/20 text-accent-ink" : "border-line/70 text-paper/40"
              }`}
            >
              {days}
            </span>
            <span className="text-[0.55rem] text-paper/35">d</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-center gap-1.5 text-[0.68rem] text-paper/60">
        <RotateCcw className="h-3 w-3 text-accent-ink" aria-hidden /> remembered
        <ArrowRight className="h-3 w-3" aria-hidden />
        <CalendarClock className="h-3 w-3 text-accent-ink" aria-hidden /> 14 days
      </div>
      <StageNote>A miss returns the item to 1 day.</StageNote>
    </StageCard>
  ),
  edit: () => (
    <StageCard title="Edit item" hint="dates are yours">
      <DemoField label="Next due" value="29 Nov" focus />
      <div className="rounded-lg border border-line/60 bg-card/45 px-2 py-1.5 text-[0.66rem] leading-snug text-paper/55">
        3 successful recalls so far · current interval 7d · the ladder runs 1 → 3 → 7 → 14 → 30 → 60 days.
      </div>
      <div className="mt-1 flex justify-between">
        <DemoChip>
          <BookMarked className="h-2.5 w-2.5" aria-hidden /> linked topic
        </DemoChip>
        <DemoButton primary>Save changes</DemoButton>
      </div>
    </StageCard>
  ),
};

function Stage({ step, playing }: { step: number; playing: boolean }) {
  const id = steps[step]?.id;
  const scene = id ? scenes[id] : undefined;
  return scene ? scene(playing) : null;
}

const experience: WalkthroughExperience = {
  id: "revision",
  version: 1,
  path: "/revision",
  title: "Revision",
  summary: "Spaced repetition that reads your own recall — and what each answer changes.",
  seconds: 85,
  steps,
  Stage,
};

export default experience;
