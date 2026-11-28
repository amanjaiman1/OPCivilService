"use client";

import { Check, Flame, MoonStar, Plus } from "lucide-react";
import { DemoButton, DemoCheck, DemoChip, DemoField, Pointer, StageCard, StageNote, TypingText } from "../demo-kit";
import type { WalkthroughExperience, WalkthroughStep } from "@/lib/walkthroughs/types";

/* ════════════════════════════════════════════════════════════════
   HABITS
   A cadence per week, a log per day. A tick is a fact about a day, and a
   rest day is the schedule's business — never a broken streak.
   ════════════════════════════════════════════════════════════════ */

const steps: readonly WalkthroughStep[] = [
  {
    id: "cadence",
    chapter: "Chapter 1 · A cadence, not a promise",
    title: "Habits are counted per week",
    body: "A habit says how often it should happen — four times a week, twice, every day. The page marks the days it is due and leaves the rest alone.",
    connection: "The weekly count, not a daily all-or-nothing tick.",
    placement: "center",
  },
  {
    id: "create",
    chapter: "Chapter 2 · Creating one",
    title: "Small enough to keep",
    body: "Name it, then choose the cadence. Everything else is optional, because a habit that needs a form filled in is a habit that gets skipped.",
    target: "[data-habits-list]",
    connection: "New habits start today; nothing before today counts.",
    placement: "bottom",
  },
  {
    id: "log",
    chapter: "Chapter 3 · The log",
    title: "Each day is written down",
    body: "Ticking a day writes a log entry for that date, and unticking removes it. The week's dots are exactly those entries.",
    target: "[data-habits-list]",
    connection: "The same entries Daily Capture's Habits tab writes.",
    placement: "top",
  },
  {
    id: "rest",
    chapter: "Chapter 4 · Rest days",
    title: "A missed due day is not a failure",
    body: "A day you did not have to do the habit never breaks a streak. The habit engine reads the schedule first, then the log.",
    connection: "Streaks are computed from the schedule plus the log.",
    placement: "center",
  },
  {
    id: "streak",
    chapter: "Chapter 5 · What a streak means",
    title: "Consistency, shown without scolding",
    body: "The flame is the run of scheduled periods you kept. Pausing or retiring a habit keeps its history — it never rewrites the past.",
    target: "[data-habits-list]",
    connection: "Read by the weekly review and the coach's summary.",
    placement: "top",
  },
  {
    id: "capture",
    chapter: "Chapter 6 · Capture, in passing",
    title: "You rarely need this page",
    body: "Habits due today appear in Daily Capture, so the daily loop stays in one popup. This page is for the shape of the week and for changing a cadence.",
    connection: "Capture → habit log → this page's dots.",
    placement: "center",
  },
];

const scenes: Record<string, (playing: boolean) => React.ReactNode> = {
  cadence: () => (
    <StageCard title="Habits" hint="this week">
      <div className="grid grid-cols-7 gap-1 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
          <div key={`${day}-${index}`} className="text-[0.58rem] text-paper/35">{day}</div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-lg border border-line/60 bg-card/50 px-2.5 py-2">
        <span className="text-[0.72rem] text-paper/80">Morning current affairs</span>
        <DemoChip active>4 × a week</DemoChip>
      </div>
      <DemoCheck checked label="Due today" />
      <StageNote>The cadence decides the due days; the log decides the ticks.</StageNote>
    </StageCard>
  ),
  create: (playing) => (
    <StageCard title="New habit" hint="name and cadence">
      <DemoField label="Name" value={<TypingText text="One newspaper editorial" playing={playing} />} focus />
      <div className="flex gap-1.5">
        <DemoChip>Daily</DemoChip>
        <DemoChip active>4 × week</DemoChip>
        <DemoChip>2 × week</DemoChip>
      </div>
      <div className="mt-1 flex justify-end">
        <DemoButton primary pressed={playing}>
          <Plus className="h-3 w-3" aria-hidden /> Add habit
        </DemoButton>
      </div>
      <Pointer x={78} y={70} click />
    </StageCard>
  ),
  log: (playing) => (
    <StageCard title="The log" hint="per day">
      <div className="flex items-center justify-between rounded-lg border border-line/60 bg-card/50 px-2.5 py-2">
        <span className="text-[0.7rem] text-paper/80">Evening revision</span>
        <div className="flex gap-1">
          {[true, true, false, true, true, false, playing].map((done, index) => (
            <span
              key={index}
              className={`grid h-4 w-4 place-items-center rounded-full border ${
                done ? "border-[rgb(var(--positive)/0.6)] bg-[rgb(var(--positive)/0.85)] text-white" : "border-line/70"
              }`}
            >
              {done && <Check className="h-2.5 w-2.5" aria-hidden />}
            </span>
          ))}
        </div>
      </div>
      <StageNote>Ticking writes one dated entry; unticking removes it.</StageNote>
    </StageCard>
  ),
  rest: () => (
    <StageCard title="Rest day" hint="not a miss">
      <div className="flex items-center justify-between rounded-lg border border-line/60 bg-card/50 px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-[0.7rem] text-paper/80">
          <MoonStar className="h-3.5 w-3.5 text-paper/45" aria-hidden /> Sunday
        </span>
        <span className="text-[0.64rem] text-paper/45">not scheduled</span>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-[rgb(var(--positive)/0.35)] bg-[rgb(var(--positive)/0.08)] px-2.5 py-2">
        <span className="text-[0.7rem] text-paper/80">Streak</span>
        <span className="flex items-center gap-1 text-[0.7rem] font-semibold text-[rgb(var(--positive))]">
          <Flame className="h-3.5 w-3.5" aria-hidden /> 6 weeks
        </span>
      </div>
    </StageCard>
  ),
  streak: () => (
    <StageCard title="This week" hint="schedule plus log">
      <div className="flex items-center justify-between rounded-lg border border-line/60 bg-card/50 px-2.5 py-2">
        <span className="text-[0.72rem] text-paper/80">One newspaper editorial</span>
        <DemoChip active tone="positive">
          <Flame className="h-2.5 w-2.5" aria-hidden /> 12
        </DemoChip>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {["M", "T", "W", "T"].map((day, index) => (
          <div key={day} className={`rounded-md border py-1 text-center text-[0.6rem] ${index < 3 ? "border-[rgb(var(--positive)/0.4)] text-[rgb(var(--positive))]" : "border-line/60 text-paper/35"}`}>
            {day}
          </div>
        ))}
      </div>
      <StageNote>Retiring a habit keeps every log entry it ever had.</StageNote>
    </StageCard>
  ),
  capture: () => (
    <StageCard title="Daily Capture" hint="habits due today">
      <div className="flex items-center justify-between rounded-lg border border-accent/40 bg-accent/[0.07] px-2.5 py-1.5">
        <span className="text-[0.7rem] text-paper/80">Morning current affairs</span>
        <DemoCheck checked label="" />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-line/60 bg-card/45 px-2.5 py-1.5">
        <span className="text-[0.7rem] text-paper/75">Evening revision</span>
        <DemoCheck checked={false} label="" />
      </div>
      <StageNote>The daily loop stays in one popup; this page is for the shape of the week.</StageNote>
    </StageCard>
  ),
};

function Stage({ step, playing }: { step: number; playing: boolean }) {
  const id = steps[step]?.id;
  const scene = id ? scenes[id] : undefined;
  return scene ? scene(playing) : null;
}

const experience: WalkthroughExperience = {
  id: "habits",
  version: 1,
  path: "/habits",
  title: "Habits",
  summary: "A weekly cadence with a log per day, and the streaks that follow from it.",
  seconds: 70,
  steps,
  Stage,
};

export default experience;
