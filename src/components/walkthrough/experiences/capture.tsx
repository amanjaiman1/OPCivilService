"use client";

import { CalendarCheck, Check, NotebookPen, Target } from "lucide-react";
import {
  DemoBar,
  DemoButton,
  DemoCheck,
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
   DAILY CAPTURE — THE FLAGSHIP
   Eight chapters, one popup. The film never shows a field the popup does
   not have, and every claim in a caption is the popup's own behaviour:
   four tabs over one day, drafts kept per account, one save that writes
   through the store's real actions.
   ════════════════════════════════════════════════════════════════ */

const steps: readonly WalkthroughStep[] = [
  {
    id: "one-popup",
    chapter: "Chapter 1 · One popup",
    title: "Yesterday's work, today's log — in one place",
    body: "Capture opens over whatever page you are on and edits the same records as the full pages. Nothing here is a second, separate tracker.",
    connection: "Saves to your journal, life log, goals and habits.",
    placement: "center",
  },
  {
    id: "study",
    chapter: "Chapter 2 · Study",
    title: "Say what you actually studied",
    body: "Pick a subject, then type the hours or use the steppers. Each subject you add becomes a row of today's journal entry, not a private note.",
    target: '[data-capture-tab="day"]',
    connection: "Feeds the heatmap, the analysis tab and every hours target.",
    placement: "bottom",
  },
  {
    id: "life",
    chapter: "Chapter 3 · Life",
    title: "Four readings in about ten seconds",
    body: "Mood, energy, focus and stress are sliders, and sleep is two times. They sit beside the study record without changing it.",
    target: '[data-capture-tab="life"]',
    connection: "Shown beside your study on Wellbeing and the weekly review.",
    placement: "bottom",
  },
  {
    id: "goals",
    chapter: "Chapter 4 · Goals",
    title: "Move today's goals forward",
    body: "Only the goals whose cadence falls on today are listed. Each amount you add is today's contribution — the goal's own progress total updates when you save.",
    target: '[data-capture-tab="goals"]',
    connection: "Writes through to Goals and the Roadmap.",
    placement: "bottom",
  },
  {
    id: "habits",
    chapter: "Chapter 5 · Habits",
    title: "Tick the systems that make the goals possible",
    body: "Habits due today appear with their cadence. A tick is a log entry for this day; a rest day never breaks a streak.",
    target: '[data-capture-tab="habit"]',
    connection: "The same log the Habits page reads, at the same moment.",
    placement: "bottom",
  },
  {
    id: "save",
    chapter: "Chapter 6 · Save",
    title: "One save, four records",
    body: "Save All Changes applies every edited tab through the store's own actions, so what you see here is what every other page will read.",
    target: "[data-capture-save]",
    connection: "Journal, life log, goals and habits are written together.",
    placement: "top",
  },
  {
    id: "drafts",
    chapter: "Chapter 7 · Drafts",
    title: "Leaving early costs nothing",
    body: "A half-filled tab is kept as a draft against this account and this day, in this browser. Come back — even after a reload — and it is still there.",
    connection: "Drafts never enter the synced snapshot until you save.",
    placement: "center",
  },
  {
    id: "lands",
    chapter: "Chapter 8 · Where it lands",
    title: "Everything else already reads this day",
    body: "The journal entry becomes a heatmap square and a revision record; the goal amounts appear on Goals; the readings appear on Wellbeing. Nothing needs exporting.",
    connection: "One day in, five pages updated.",
    placement: "center",
  },
];

const scenes: Record<string, (playing: boolean) => React.ReactNode> = {
  "one-popup": () => (
    <StageCard title="Daily Capture" hint="one day">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Study", hint: "2h 30m", active: true },
          { label: "Life", hint: "4 readings" },
          { label: "Goals", hint: "2 today" },
          { label: "Habits", hint: "3 of 5" },
        ].map((tab) => (
          <div
            key={tab.label}
            className={`rounded-xl border px-2.5 py-2 ${tab.active ? "border-accent/60 bg-accent/10" : "border-line/60 bg-card/50"}`}
          >
            <p className="text-[0.74rem] font-semibold text-paper/85">{tab.label}</p>
            <p className="text-[0.66rem] text-paper/45">{tab.hint}</p>
          </div>
        ))}
      </div>
      <StageNote>Four tabs, one day, saved together.</StageNote>
    </StageCard>
  ),
  study: () => (
    <StageCard title="Study" hint="today">
      <div className="grid grid-cols-2 gap-2">
        <DemoField label="Subject" value="Polity" focus />
        <DemoField label="Topic" value="Federalism" />
      </div>
      <DemoField label="Hours" value={<TypingText text="2h 30m" playing />} focus />
      <div className="mt-1 flex items-center gap-1.5">
        <DemoChip active>+ 2h 30m</DemoChip>
        <DemoChip>Another subject</DemoChip>
      </div>
      <Pointer x={38} y={62} click />
    </StageCard>
  ),
  life: (playing) => (
    <StageCard title="Life" hint="how today felt">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Mood", value: 0.72, tone: "accent" as const },
          { label: "Energy", value: 0.55, tone: "warning" as const },
          { label: "Focus", value: 0.8, tone: "accent" as const },
          { label: "Stress", value: 0.3, tone: "positive" as const },
        ].map((reading) => (
          <div key={reading.label} className="rounded-lg border border-line/60 bg-card/50 px-2 py-1.5">
            <p className="mb-1 text-[0.66rem] text-paper/50">{reading.label}</p>
            <DemoBar value={playing ? reading.value : 0} tone={reading.tone} />
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <DemoField label="Bed" value="23:40" />
        <DemoField label="Woke" value="06:10" />
      </div>
      <Pointer x={16} y={30} />
    </StageCard>
  ),
  goals: (playing) => (
    <StageCard title="Goals" hint="due today">
      <div className="rounded-lg border border-line/60 bg-card/50 px-2 py-1.5">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <p className="text-[0.72rem] font-medium text-paper/80">Answer 40 MCQs</p>
          <span className="text-[0.66rem] tabular-nums text-paper/45">26 / 40</span>
        </div>
        <DemoBar value={playing ? 0.65 : 0.4} />
        <div className="mt-1.5 flex items-center gap-1.5">
          <DemoChip active>+ 4 today</DemoChip>
          <DemoChip>+ 10</DemoChip>
          <DemoRing value={0.65} caption="this week" />
        </div>
      </div>
      <StageNote>Saved amounts count towards the goal, not against today only.</StageNote>
    </StageCard>
  ),
  habits: (playing) => (
    <StageCard title="Habits" hint="due today">
      <div className="flex flex-col gap-2 rounded-lg border border-line/60 bg-card/50 px-2.5 py-2">
        <DemoCheck checked label="Morning current affairs — 20 min" />
        <DemoCheck checked={playing} label="One newspaper editorial" />
        <DemoCheck checked={false} label="Evening revision — 45 min" />
      </div>
      <div className="flex items-center gap-1.5">
        <DemoChip active tone="positive">4 of 5 done</DemoChip>
        <span className="text-[0.66rem] text-paper/45">rest days never break a streak</span>
      </div>
    </StageCard>
  ),
  save: (playing) => (
    <StageCard title="Save" hint="all changes">
      <div className="flex flex-1 flex-col justify-center gap-2">
        <div className="mx-auto">
          <DemoButton primary pressed={playing}>Save All Changes</DemoButton>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {["Study saved", "Life saved", "Goals saved", "Habits saved"].map((label) => (
            <span key={label} className="flex items-center gap-1 rounded-md border border-[rgb(var(--positive)/0.35)] bg-[rgb(var(--positive)/0.1)] px-2 py-1 text-[0.66rem] text-[rgb(var(--positive))]">
              <Check className="h-2.5 w-2.5" aria-hidden /> {label}
            </span>
          ))}
        </div>
      </div>
      <Pointer x={50} y={40} click />
    </StageCard>
  ),
  drafts: () => (
    <StageCard title="Close without saving?" hint="unsaved work">
      <div className="flex flex-1 flex-col justify-center gap-2 text-center">
        <p className="text-[0.7rem] leading-snug text-paper/70">
          “Your changes for this day stay as a draft and come back when you open Daily Capture again.”
        </p>
        <div className="mx-auto flex gap-1.5">
          <DemoButton>Keep editing</DemoButton>
          <DemoButton primary>Close</DemoButton>
        </div>
      </div>
      <StageNote>Drafts are kept per account and per day, in this browser.</StageNote>
    </StageCard>
  ),
  lands: () => (
    <StageCard title="Where it lands" hint="today's capture">
      <div className="flex flex-1 flex-col justify-center gap-2">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent/[0.08] px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-[0.72rem] font-medium text-paper/85">
            <NotebookPen className="h-3.5 w-3.5 text-accent-ink" aria-hidden /> Study
          </span>
          <FlowLink label="Journal" />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { icon: CalendarCheck, label: "Heatmap" },
            { icon: Target, label: "Goals" },
            { icon: NotebookPen, label: "Revision" },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-1 rounded-lg border border-line/60 bg-card/50 py-2">
              <item.icon className="h-4 w-4 text-accent-ink" aria-hidden />
              <span className="text-[0.64rem] text-paper/60">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
      <StageNote>Four tabs in, four pages out — no export step.</StageNote>
    </StageCard>
  ),
};

function Stage({ step, playing }: { step: number; playing: boolean }) {
  const id = steps[step]?.id;
  const scene = id ? scenes[id] : undefined;
  return scene ? scene(playing) : null;
}

const experience: WalkthroughExperience = {
  id: "capture",
  version: 1,
  path: "capture",
  title: "Daily Capture",
  summary: "One popup that turns today into a record — study, life, goals and habits.",
  seconds: 95,
  steps,
  Stage,
};

export default experience;
