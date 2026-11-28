"use client";

import { BookOpen, Check, ChevronRight, Layers, RotateCcw, Sparkles } from "lucide-react";
import { DemoBar, DemoChip, DemoRing, FlowLink, Pointer, StageCard, StageNote } from "../demo-kit";
import type { WalkthroughExperience, WalkthroughStep } from "@/lib/walkthroughs/types";

/* ════════════════════════════════════════════════════════════════
   SUBJECTS & SYLLABUS
   The tree every other page reads: a topic's status moves forward, its
   confidence follows the recall you actually did, and finishing one can put
   it straight onto the revision queue.
   ════════════════════════════════════════════════════════════════ */

const steps: readonly WalkthroughStep[] = [
  {
    id: "tree",
    chapter: "Chapter 1 · The tree",
    title: "Subjects hold topics, and topics are the unit",
    body: "Every page that talks about progress is really talking about a topic: hours, confidence, revisions and mocks all attach here.",
    target: "[data-subjects-tree]",
    connection: "Journal rows, revision items and mock analysis all resolve to topics.",
    placement: "bottom",
  },
  {
    id: "status",
    chapter: "Chapter 2 · Status moves forward",
    title: "Untouched, learning, revised",
    body: "A topic's status only ratchets upward. Studying it again never sends it back to untouched, and a revision counts as progress on its own.",
    target: "[data-subjects-tree]",
    connection: "Status feeds the subject's completion on the dashboard.",
    placement: "top",
  },
  {
    id: "confidence",
    chapter: "Chapter 3 · Confidence is earned",
    title: "Recall adds confidence, once per revision",
    body: "A logged revision credits the topic and lifts its confidence, the same way on this page, in the journal and in the revision queue.",
    target: "[data-subjects-confidence]",
    connection: "Revision pass → + confidence → subject tone.",
    placement: "top",
  },
  {
    id: "schedule",
    chapter: "Chapter 4 · Finishing schedules recall",
    title: "Done is not the end of it",
    body: "Finishing a topic can schedule a revision item immediately, so the first review happens while the material is fresh rather than months later.",
    connection: "Topic done → revision item with its first due date.",
    placement: "center",
  },
  {
    id: "weight",
    chapter: "Chapter 5 · Where the weight is",
    title: "Weak and heavy comes first",
    body: "Weightage and confidence sit beside the tree so a low-confidence, high-weight topic is visible without opening a report. The weekly review uses the same pair.",
    target: "[data-subjects-tree]",
    connection: "Read by the coach's suggestion and the weekly review.",
    placement: "bottom",
  },
  {
    id: "flow",
    chapter: "Chapter 6 · One tree, everywhere",
    title: "Change a topic here and five pages agree",
    body: "The dashboard, heatmap, revision queue, mock analysis and roadmap all read this tree. There is no second copy of your syllabus anywhere in the app.",
    connection: "Subjects → dashboard, revision, mocks, roadmap, review.",
    placement: "center",
  },
];

const scenes: Record<string, (playing: boolean) => React.ReactNode> = {
  tree: () => (
    <StageCard title="Syllabus" hint="GS Paper II">
      <div className="flex items-center justify-between rounded-lg border border-accent/40 bg-accent/[0.08] px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-[0.74rem] font-medium text-paper/85">
          <BookOpen className="h-3.5 w-3.5 text-accent-ink" aria-hidden /> Polity
        </span>
        <span className="text-[0.64rem] tabular-nums text-paper/45">18 topics</span>
      </div>
      <div className="flex flex-col gap-1 pl-3">
        {["Federalism", "Basic structure", "Judicial review"].map((topic, index) => (
          <div key={topic} className="flex items-center gap-1.5 text-[0.68rem] text-paper/65">
            <ChevronRight className="h-3 w-3 text-paper/30" aria-hidden />
            {topic}
            {index === 0 && <DemoChip>learning</DemoChip>}
          </div>
        ))}
      </div>
      <Pointer x={64} y={34} click />
    </StageCard>
  ),
  status: () => (
    <StageCard title="Status" hint="upward only">
      <div className="flex items-center justify-between rounded-lg border border-line/60 bg-card/50 px-2.5 py-2">
        <span className="text-[0.7rem] text-paper/80">Federalism</span>
        <div className="flex gap-1">
          <DemoChip>untouched</DemoChip>
          <DemoChip active>learning</DemoChip>
          <DemoChip>revised</DemoChip>
        </div>
      </div>
      <StageNote>Studying again never sends a topic backwards.</StageNote>
    </StageCard>
  ),
  confidence: (playing) => (
    <StageCard title="Confidence" hint="earned by recall">
      <DemoRing value={playing ? 0.62 : 0.4} caption="Federalism" />
      <div className="rounded-lg border border-line/60 bg-card/45 px-2 py-1.5 text-[0.66rem] text-paper/55">
        2 revisions logged · confidence lifted each time
      </div>
      <div className="flex items-center gap-1.5 text-[0.66rem] text-accent-ink">
        <RotateCcw className="h-3 w-3" aria-hidden /> revision pass <FlowLink label="+ confidence" />
      </div>
    </StageCard>
  ),
  schedule: () => (
    <StageCard title="Finish topic" hint="schedule the recall">
      <div className="rounded-lg border border-line/60 bg-card/50 px-2.5 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[0.72rem] text-paper/80">Federalism</span>
          <DemoChip active tone="positive">
            <Check className="h-2.5 w-2.5" aria-hidden /> done today
          </DemoChip>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <DemoChip active>Schedule revision</DemoChip>
          <span className="text-[0.62rem] text-paper/40">due in 1 day</span>
        </div>
      </div>
      <Pointer x={30} y={64} click />
    </StageCard>
  ),
  weight: (playing) => (
    <StageCard title="Where the weight is" hint="weak and heavy first">
      <div className="flex flex-col gap-1.5">
        {[
          { label: "Polity", weight: 0.9, confidence: 0.62 },
          { label: "Geography", weight: 0.7, confidence: 0.35 },
          { label: "History", weight: 0.55, confidence: 0.8 },
        ].map((row) => (
          <div key={row.label} className="rounded-lg border border-line/60 bg-card/45 px-2 py-1.5">
            <div className="mb-1 flex justify-between text-[0.66rem] text-paper/70">
              <span>{row.label}</span>
              <span className="tabular-nums">{Math.round(row.confidence * 100)}%</span>
            </div>
            <DemoBar value={playing ? row.confidence : 0} tone={row.confidence < 0.5 ? "warning" : "accent"} />
          </div>
        ))}
      </div>
    </StageCard>
  ),
  flow: () => (
    <StageCard title="One tree, everywhere" hint="no second copy">
      <div className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/[0.08] px-2.5 py-2">
        <Layers className="h-4 w-4 text-accent-ink" aria-hidden />
        <span className="text-[0.72rem] font-medium text-paper/85">Syllabus tree</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {["Dashboard", "Heatmap", "Revision", "Mock analysis", "Roadmap", "Weekly review"].map((label) => (
          <div key={label} className="flex items-center gap-1 rounded-md border border-line/60 bg-card/45 px-2 py-1 text-[0.64rem] text-paper/65">
            <Sparkles className="h-2.5 w-2.5 text-accent-ink" aria-hidden /> {label}
          </div>
        ))}
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
  id: "subjects",
  version: 1,
  path: "/subjects",
  title: "Subjects & Syllabus",
  summary: "The syllabus tree, confidence per topic, and how every other page reads it.",
  seconds: 80,
  steps,
  Stage,
};

export default experience;
