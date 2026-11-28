"use client";

import { CalendarRange, Flag, Target, TrendingUp } from "lucide-react";
import {
  DemoBar,
  DemoButton,
  DemoChip,
  DemoField,
  DemoRing,
  FlowLink,
  Pointer,
  StageCard,
  StageNote,
  TypingText,
} from "../demo-kit";
import type { WalkthroughExperience, WalkthroughStep } from "@/lib/walkthroughs/types";

/* ════════════════════════════════════════════════════════════════
   GOALS
   Ambition broken into the achievable: a target, a cadence, and amounts
   recorded from the capture popup. Progress is computed from those records,
   never typed in twice.
   ════════════════════════════════════════════════════════════════ */

const steps: readonly WalkthroughStep[] = [
  {
    id: "shape",
    chapter: "Chapter 1 · One goal, one number",
    title: "Every goal has an amount and a cadence",
    body: "A goal is a target number, a unit, and how often it should move — daily, weekly or once. The card shows the part you can do this week.",
    connection: "Cadence decides when the goal appears in Daily Capture.",
    placement: "center",
  },
  {
    id: "create",
    chapter: "Chapter 2 · Creating one",
    title: "Start specific, not aspirational",
    body: "Title, target, unit and cadence are enough. Category and target date help the Roadmap and the weekly review place it beside your other work.",
    target: "[data-goals-add]",
    connection: "A goal with a cadence becomes actionable today.",
    placement: "bottom",
  },
  {
    id: "progress",
    chapter: "Chapter 3 · Progress is a record",
    title: "The bar moves when work is logged",
    body: "Adding 4 today writes a contribution against this date. The percentage is that record summed — edit the log, not the percentage.",
    target: "[data-goals-list]",
    connection: "Reads the same contributions Daily Capture writes.",
    placement: "bottom",
  },
  {
    id: "milestones",
    chapter: "Chapter 4 · Milestones",
    title: "Break the long goal into checkpoints",
    body: "A milestone is a smaller number inside a goal, with its own done date. Search and the progress view treat them as one family, so nothing is lost between them.",
    connection: "Milestones tell the goal's story; the amount stays the goal's number.",
    placement: "center",
  },
  {
    id: "risk",
    chapter: "Chapter 5 · Overdue, not failed",
    title: "A missed cadence is shown, not hidden",
    body: "Active, completed and overdue are separate filters, so a goal that slipped is visible before the week ends.",
    connection: "Feeds the weekly review's list of what slipped.",
    placement: "bottom",
  },
  {
    id: "flow",
    chapter: "Chapter 6 · Where it goes",
    title: "Capture, Roadmap and review all read it",
    body: "The goal appears in the capture popup on its cadence days, on the Roadmap if you linked it, and in the review's progress list. One definition, three readers.",
    connection: "Goals → Capture → Roadmap → Weekly review.",
    placement: "center",
  },
];

const scenes: Record<string, (playing: boolean) => React.ReactNode> = {
  shape: (playing) => (
    <StageCard title="Goals" hint="a target with a cadence">
      <div className="rounded-lg border border-line/60 bg-card/50 px-2.5 py-2">
        <p className="text-[0.76rem] font-semibold text-paper/85">Answer 40 MCQs</p>
        <p className="mb-2 text-[0.66rem] text-paper/45">Daily · 40 questions · GS Paper II</p>
        <div className="flex items-center justify-between text-[0.66rem] tabular-nums text-paper/55">
          <span>Today 26 / 40</span>
          <span>Week 152 / 280</span>
        </div>
        <DemoBar className="mt-1.5" value={playing ? 0.65 : 0.3} />
      </div>
      <StageNote>Cadence decides the days this appears in Daily Capture.</StageNote>
    </StageCard>
  ),
  create: (playing) => (
    <StageCard title="New goal" hint="four fields">
      <DemoField label="Title" value={<TypingText text="Answer 40 MCQs" playing={playing} speed={20} />} focus />
      <div className="grid grid-cols-3 gap-1.5">
        <DemoField label="Target" value="40" />
        <DemoField label="Unit" value="questions" />
        <DemoField label="Cadence" value="Daily" />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <DemoChip>Target date</DemoChip>
        <DemoButton primary pressed={playing}>Create goal</DemoButton>
      </div>
      <Pointer x={82} y={78} click />
    </StageCard>
  ),
  progress: (playing) => (
    <StageCard title="Progress" hint="written, then summed">
      <div className="rounded-lg border border-line/60 bg-card/50 px-2.5 py-2">
        <div className="flex items-center justify-between">
          <p className="text-[0.74rem] font-medium text-paper/80">Answer 40 MCQs</p>
          <span className="text-[0.66rem] tabular-nums text-paper/50">26 / 40</span>
        </div>
        <DemoBar className="mt-1.5" value={playing ? 0.65 : 0.5} />
        <div className="mt-2 flex items-center gap-1.5">
          <DemoChip active>+ 4 today</DemoChip>
          <DemoChip>+ 10</DemoChip>
          <span className="ml-auto text-[0.62rem] text-paper/40">logged, not counted twice</span>
        </div>
      </div>
      <Pointer x={30} y={66} click />
    </StageCard>
  ),
  milestones: (playing) => (
    <StageCard title="Milestones" hint="inside one goal">
      <div className="flex flex-col gap-1.5">
        {[
          { label: "Finish Polity MCQs", done: true },
          { label: "Two full-length papers", done: false },
          { label: "Accuracy above 70%", done: false },
        ].map((milestone) => (
          <div key={milestone.label} className="flex items-center gap-2 rounded-lg border border-line/60 bg-card/45 px-2 py-1.5">
            <Flag className={`h-3.5 w-3.5 ${milestone.done ? "text-[rgb(var(--positive))]" : "text-paper/35"}`} aria-hidden />
            <span className="text-[0.7rem] text-paper/75">{milestone.label}</span>
          </div>
        ))}
      </div>
      <DemoRing value={playing ? 0.33 : 0.2} caption="milestones met" />
    </StageCard>
  ),
  risk: () => (
    <StageCard title="Filters" hint="overdue is not failed">
      <div className="flex gap-1.5">
        <DemoChip active>Active</DemoChip>
        <DemoChip>Completed</DemoChip>
        <DemoChip>Overdue</DemoChip>
      </div>
      <div className="rounded-lg border border-[rgb(var(--warning)/0.4)] bg-[rgb(var(--warning)/0.08)] px-2.5 py-2">
        <p className="text-[0.74rem] font-medium text-paper/85">Finish optional-syllabus notes</p>
        <p className="text-[0.66rem] text-[rgb(var(--warning))]">Missed this week · still open</p>
      </div>
      <StageNote>A missed cadence shows up in the weekly review before Sunday.</StageNote>
    </StageCard>
  ),
  flow: () => (
    <StageCard title="One goal, three readers" hint="no re-entry">
      <div className="flex flex-1 flex-col justify-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/[0.08] px-2.5 py-2">
          <Target className="h-4 w-4 text-accent-ink" aria-hidden />
          <span className="text-[0.74rem] font-medium text-paper/85">Answer 40 MCQs</span>
        </div>
        <div className="grid gap-1.5">
          {[
            { icon: CalendarRange, label: "Daily Capture", hint: "on cadence days" },
            { icon: TrendingUp, label: "Roadmap", hint: "when linked" },
            { icon: Flag, label: "Weekly review", hint: "slipped or moved" },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-2 rounded-lg border border-line/60 bg-card/45 px-2 py-1.5">
              <row.icon className="h-3.5 w-3.5 text-accent-ink" aria-hidden />
              <span className="text-[0.7rem] text-paper/80">{row.label}</span>
              <span className="ml-auto text-[0.62rem] text-paper/40">{row.hint}</span>
            </div>
          ))}
        </div>
        <div className="text-center"><FlowLink label="Capture writes · Goals sums · review reads" /></div>
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
  id: "goals",
  version: 1,
  path: "/goals",
  title: "Goals",
  summary: "From a large goal to today's measurable amount, with progress that updates itself.",
  seconds: 75,
  steps,
  Stage,
};

export default experience;
