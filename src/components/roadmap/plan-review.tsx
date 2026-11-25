"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Forward } from "lucide-react";
import type { ISODate, PlanReviewSnapshot, RoadmapPlan } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import { buildPlanReviewSnapshot, carryable, formatDay, nextPlanOf, planName, timingOf } from "@/lib/roadmap";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { formatHours, toISODate } from "@/lib/utils";
import { Block, useRoadmapNav } from "./shared";

function TitleList({ titles, empty }: { titles: string[]; empty: string }) {
  if (!titles.length) return <p className="text-[0.75rem] text-paper/55">{empty}</p>;
  const shown = titles.slice(0, 6);
  return (
    <ul className="space-y-1">
      {shown.map((t, i) => (
        <li key={i} className="line-clamp-2 text-[0.8rem] leading-snug text-paper/80" title={t}>
          {t}
        </li>
      ))}
      {titles.length > shown.length && <li className="text-[0.72rem] text-paper/55">and {titles.length - shown.length} more</li>}
    </ul>
  );
}

export function PlanReviewEvidence({ snapshot }: { snapshot: PlanReviewSnapshot }) {
  const groups = [
    { label: "Objectives completed", titles: snapshot.objectives },
    { label: "Activities completed", titles: snapshot.activities },
    { label: "Milestones reached", titles: snapshot.milestones },
    { label: "Still open", titles: snapshot.remaining },
    { label: "Deferred", titles: snapshot.deferred },
    { label: "Carried forward", titles: snapshot.carried },
  ];
  return (
    <div className="space-y-3">
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map(({ label, titles }) => (
          <div key={label} className="min-w-0 rounded-xl border border-line bg-paper/[0.02] p-3">
            <dt className="mb-1.5 text-xs font-semibold text-paper/80">{label} · {titles.length}</dt>
            <dd><TitleList titles={titles} empty="None" /></dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-paper/65">
        Journal activity · {snapshot.journalDays} days logged · {formatHours(snapshot.studyHours)} studied · {snapshot.topics} topics completed
      </p>
    </div>
  );
}

/**
 * Looking back. What was done and what wasn't is read from the activities;
 * the rest is yours to write. Carrying forward and planning the next period
 * are one step from here, and nothing is changed until you choose.
 */
export function PlanReviewBlock({
  plan,
  today,
  onCarry,
  onPlanNext,
}: {
  plan: RoadmapPlan;
  today: ISODate;
  onCarry: () => void;
  onPlanNext: () => void;
}) {
  const plans = useChronicle((s) => s.plans);
  const journal = useChronicle((s) => s.journal);
  const savePlanReview = useChronicle((s) => s.savePlanReview);
  const nav = useRoadmapNav();
  const [wentWell, setWentWell] = useState("");
  const [improve, setImprove] = useState("");
  const [nextPriorities, setNextPriorities] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setWentWell(plan.review?.wentWell ?? "");
    setImprove(plan.review?.improve ?? "");
    setNextPriorities(plan.review?.nextPriorities ?? "");
    setSaved(false);
  }, [plan.id, plan.review?.wentWell, plan.review?.improve, plan.review?.nextPriorities]);

  const live = useMemo(() => buildPlanReviewSnapshot(plans, plan, journal, today), [plans, plan, journal, today]);
  const canCarry = plan.level !== "year" && carryable(plans, plan).length > 0;
  const timing = timingOf(plan, today);
  const next = nextPlanOf(plans, plan);
  const dirty =
    wentWell !== (plan.review?.wentWell ?? "") || improve !== (plan.review?.improve ?? "") || nextPriorities !== (plan.review?.nextPriorities ?? "");
  const nextNoun = plan.level === "week" ? "week" : plan.level === "month" ? "month" : "year";
  const reviewsHref = "/performance-review";
  const when = useMemo(() => {
    const at = plan.review?.reviewedAt ? new Date(plan.review.reviewedAt) : null;
    return at && !Number.isNaN(at.getTime()) ? formatDay(toISODate(at)) : null;
  }, [plan.review?.reviewedAt]);

  return (
    <Block
      id={`review-${plan.id}`}
      title={`${nextNoun === "week" ? "Weekly" : nextNoun === "month" ? "Monthly" : "Yearly"} review`}
      hint={
        timing.state === "ended"
          ? `This ${plan.level} has ended. What happened, and what comes next?`
          : timing.state === "current"
            ? `Write it on the last day, or whenever you're ready. ${timing.daysLeft} day${timing.daysLeft === 1 ? "" : "s"} left.`
            : `This ${plan.level} hasn't started yet.`
      }
    >
      <p className="text-xs font-semibold text-paper/70">Live period activity</p>
      <PlanReviewEvidence snapshot={live} />
      {canCarry && (
        <Button variant="subtle" size="sm" onClick={onCarry}>
          <Forward className="h-3.5 w-3.5" /> Carry unfinished work forward
        </Button>
      )}
      {plan.review?.snapshot && (
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold text-paper/75">Saved activity snapshot{when ? ` · ${when}` : ""}</summary>
          <div className="mt-3"><PlanReviewEvidence snapshot={plan.review.snapshot} /></div>
        </details>
      )}

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          savePlanReview(plan.id, { wentWell, improve, nextPriorities });
          setSaved(true);
        }}
      >
        <p className="text-xs font-semibold text-paper/70">Reflection (optional)</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="What went well?">
            <Textarea value={wentWell} onChange={(e) => { setWentWell(e.target.value); setSaved(false); }} maxLength={1000} className="min-h-[88px]" />
          </Field>
          <Field label="What needs improvement?">
            <Textarea value={improve} onChange={(e) => { setImprove(e.target.value); setSaved(false); }} maxLength={1000} className="min-h-[88px]" />
          </Field>
          <Field label={`What comes first next ${nextNoun}?`}>
            <Textarea
              value={nextPriorities}
              onChange={(e) => { setNextPriorities(e.target.value); setSaved(false); }}
              maxLength={1000}
              className="min-h-[88px]"
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={saved && !dirty}>
            Save review
          </Button>
          {saved && !dirty ? (
            <span className="inline-flex items-center gap-1 text-[0.75rem] text-positive" role="status">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          ) : (
            when && <span className="text-[0.72rem] text-paper/55">Last saved {when}</span>
          )}
          <span className="flex-1" />
          {plan.level !== "year" &&
            (next ? (
              <Button variant="ghost" size="sm" onClick={() => nav({ plan: next.id })}>
                Open {planName(next)} <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onPlanNext}>
                Plan next {nextNoun}
              </Button>
            ))}
        </div>
      </form>
      <Link href={reviewsHref} className="text-xs font-semibold text-accent hover:underline">
        Open Performance Review
      </Link>
    </Block>
  );
}
