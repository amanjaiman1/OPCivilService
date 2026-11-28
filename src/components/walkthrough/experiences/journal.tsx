"use client";

import { BookOpen, CalendarDays, Eye, LineChart } from "lucide-react";
import {
  DemoBar,
  DemoChip,
  DemoField,
  DemoSelect,
  FlowLink,
  Pointer,
  StageCard,
  StageNote,
  TypingText,
} from "../demo-kit";
import type { WalkthroughExperience, WalkthroughStep } from "@/lib/walkthroughs/types";

/* ════════════════════════════════════════════════════════════════
   STUDY JOURNAL
   The page where a day becomes evidence: hours by subject, how it felt,
   and an honest line about the work. What is claimed here — the heatmap
   square, the revision credit, the analysis tab — is what the store does.
   ════════════════════════════════════════════════════════════════ */

const steps: readonly WalkthroughStep[] = [
  {
    id: "one-entry",
    chapter: "Chapter 1 · One entry a day",
    title: "A journal entry is the day's record",
    body: "Each date holds one entry. Editing it again the same day updates that entry rather than adding a second one.",
    connection: "One entry per date, replaceable without losing history elsewhere.",
    placement: "center",
  },
  {
    id: "study",
    chapter: "Chapter 2 · Study by subject",
    title: "Log hours against the subject they belong to",
    body: "Add a row per subject and set the hours with the steppers or by typing. The subject tree supplies the names, so the totals line up with every other page.",
    target: "[data-journal-study]",
    connection: "Becomes the heatmap square and the weekly hours targets.",
    placement: "bottom",
  },
  {
    id: "feelings",
    chapter: "Chapter 3 · How it felt",
    title: "Four readings that explain the hours",
    body: "Mood, energy, focus and stress take seconds and are stored with the day. They are what the weekly review reads when hours alone do not explain a week.",
    target: "[data-journal-feelings]",
    connection: "Read beside your study on Wellbeing and the review.",
    placement: "bottom",
  },
  {
    id: "reflection",
    chapter: "Chapter 4 · The honest line",
    title: "Highlight, reflection, and what slipped",
    body: "The highlight is the one thing worth remembering. More details hold the failures, lessons, books and mocks — the material the next review actually uses.",
    target: "[data-journal-reflection]",
    connection: "Failures here can become mistakes; books feed the reading log.",
    placement: "top",
  },
  {
    id: "revision",
    chapter: "Chapter 5 · Revision credit",
    title: "Revising here moves the queue",
    body: "Picking a revision item and saying whether you remembered it advances that item's interval. A forgotten item comes back sooner, not later.",
    connection: "Writes to the revision queue and the topic's confidence.",
    placement: "center",
  },
  {
    id: "after",
    chapter: "Chapter 6 · What reads it",
    title: "The entry is already part of the graph",
    body: "Saving closes the loop: the day appears on the heatmap, in the analysis tab, and in the weekly review's comparison of hours against how the week felt.",
    connection: "Journal → heatmap, analysis, review, topic confidence.",
    placement: "center",
  },
];

const scenes: Record<string, (playing: boolean) => React.ReactNode> = {
  "one-entry": () => (
    <StageCard title="Journal" hint="today">
      <div className="flex items-center justify-between rounded-lg border border-line/60 bg-card/50 px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-[0.74rem] text-paper/80">
          <CalendarDays className="h-3.5 w-3.5 text-accent-ink" aria-hidden /> Today
        </span>
        <DemoChip active>Draft</DemoChip>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {["Study", "Feelings", "Reflection"].map((label) => (
          <div key={label} className="rounded-lg border border-line/60 bg-card/40 px-2 py-1.5 text-center text-[0.66rem] text-paper/55">
            {label}
          </div>
        ))}
      </div>
      <StageNote>One entry per date; editing it again replaces that day.</StageNote>
    </StageCard>
  ),
  study: (playing) => (
    <StageCard title="Study by subject" hint="hours">
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <DemoSelect label="Subject" value="Modern History" />
        <DemoField label="Hours" className="w-20" value={<TypingText text="1.5" playing={playing} />} focus />
      </div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <DemoSelect label="Subject" value="Geography" />
        <DemoField label="Hours" className="w-20" value="2" />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <DemoChip active>+ Add subject</DemoChip>
        <span className="text-[0.68rem] tabular-nums text-paper/55">3.5h today</span>
      </div>
      <Pointer x={62} y={34} click />
    </StageCard>
  ),
  feelings: (playing) => (
    <StageCard title="How today felt" hint="four readings">
      {[
        { label: "Mood", value: 0.7 },
        { label: "Energy", value: 0.45 },
        { label: "Focus", value: 0.85 },
        { label: "Stress", value: 0.35 },
      ].map((reading) => (
        <div key={reading.label}>
          <div className="mb-1 flex justify-between text-[0.66rem] text-paper/55">
            <span>{reading.label}</span>
            <span className="tabular-nums">{Math.round((playing ? reading.value : 0) * 5)}/5</span>
          </div>
          <DemoBar value={playing ? reading.value : 0} />
        </div>
      ))}
    </StageCard>
  ),
  reflection: (playing) => (
    <StageCard title="Reflection" hint="optional, but read">
      <DemoField label="Highlight of the day" value={<TypingText text="Compared federal and unitary models" playing={playing} speed={18} />} />
      <DemoField label="What slipped?" value="Lost 40 minutes to notes I never reviewed" />
      <div className="flex gap-1.5">
        <DemoChip active>Failures</DemoChip>
        <DemoChip>Lessons</DemoChip>
        <DemoChip>Books</DemoChip>
        <DemoChip>Mocks</DemoChip>
      </div>
    </StageCard>
  ),
  revision: () => (
    <StageCard title="Revision" hint="today's queue">
      <div className="rounded-lg border border-accent/40 bg-accent/[0.07] px-2.5 py-2">
        <p className="text-[0.68rem] font-medium text-accent-ink">Federalism · Polity</p>
        <p className="mb-1.5 text-[0.64rem] text-paper/50">Due today · last interval 7 days</p>
        <div className="flex gap-1.5">
          <DemoChip active tone="positive">Remembered → 14 days</DemoChip>
          <DemoChip>Forgotten → 1 day</DemoChip>
        </div>
      </div>
      <StageNote>The interval ladder runs 1 → 3 → 7 → 14 → 30 → 60 days.</StageNote>
    </StageCard>
  ),
  after: () => (
    <StageCard title="After saving" hint="already read">
      <div className="flex flex-1 flex-col justify-center gap-1.5">
        {[
          { icon: CalendarDays, label: "Heatmap square", hint: "hours logged" },
          { icon: LineChart, label: "Analysis tab", hint: "hours vs. feelings" },
          { icon: BookOpen, label: "Topic confidence", hint: "recall credited" },
          { icon: Eye, label: "Weekly review", hint: "what the week said" },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2 rounded-lg border border-line/60 bg-card/45 px-2 py-1.5">
            <row.icon className="h-3.5 w-3.5 text-accent-ink" aria-hidden />
            <span className="text-[0.7rem] text-paper/80">{row.label}</span>
            <span className="ml-auto text-[0.62rem] text-paper/40">{row.hint}</span>
          </div>
        ))}
        <div className="text-center"><FlowLink label="One save, four readers" /></div>
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
  id: "journal",
  version: 1,
  path: "/journal",
  aliases: ["/journal/history"],
  title: "Study Journal",
  summary: "A daily entry that feeds your revision queue, your confidence and your heatmap.",
  seconds: 80,
  steps,
  Stage,
};

export default experience;
