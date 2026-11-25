"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, CalendarCheck, Check, ChevronRight, Clock, Flag, Sparkles } from "lucide-react";
import type { ISODate } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import { weeklyPlanToday, type TodayPlanEntry } from "@/lib/plan-today";
import { planName } from "@/lib/roadmap";
import { cn } from "@/lib/utils";

/**
 * The active weekly plan, asked one question: what does it want today?
 *
 * It is a reminder, not a second task list: ticking a row completes the
 * original Roadmap record, "Worked on this today" only links the row to the
 * journal day (leaving it open), and "Still pending" leaves it exactly as it
 * was. History from other weeks never appears here.
 */
export function WeeklyPlanToday({
  date,
  compact = false,
  onOpen,
}: {
  date: ISODate;
  /** A short version for the Day tab: counts and the next row, not every list. */
  compact?: boolean;
  /** Opens the full Plan tab inside Daily Capture, when there is one. */
  onOpen?: () => void;
}) {
  const plans = useChronicle((s) => s.plans);
  const setPlanItemStatus = useChronicle((s) => s.setPlanItemStatus);
  const setItemJournalLink = useChronicle((s) => s.setItemJournalLink);
  const setPlanObjectiveStatus = useChronicle((s) => s.setPlanObjectiveStatus);
  const setObjectiveJournalLink = useChronicle((s) => s.setObjectiveJournalLink);
  const [leftPending, setLeftPending] = useState<Set<string>>(new Set());
  const view = useMemo(() => weeklyPlanToday(plans, date), [plans, date]);

  if (!view.plan) {
    if (compact) return null;
    return (
      <div className="rounded-xl border border-dashed border-line px-4 py-5 text-center">
        <CalendarCheck className="mx-auto h-6 w-6 text-paper/30" />
        <p className="mt-2 text-[0.82rem] font-semibold text-paper">No weekly plan for this week</p>
        <p className="mt-1 text-[0.75rem] text-paper/60">
          Plan the week once, then let it follow you day by day. Goals are not needed for it.
        </p>
        <Link href="/roadmap?tab=weeks" className="mt-2 inline-flex items-center gap-1 text-[0.78rem] font-semibold text-accent hover:underline">
          Go to the Roadmap <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  const plan = view.plan;
  const donePct = view.total ? Math.round((view.done / view.total) * 100) : 0;
  const nextUp = view.scheduled[0] ?? view.overdue[0] ?? view.objectives[0] ?? view.unscheduled[0];

  function complete(entry: TodayPlanEntry) {
    if (entry.kind === "objective") setPlanObjectiveStatus(plan!.id, entry.id, "completed");
    else setPlanItemStatus(plan!.id, entry.id, "completed");
  }

  function workedOn(entry: TodayPlanEntry) {
    const on = !entry.workedToday;
    if (entry.kind === "objective") setObjectiveJournalLink(plan!.id, entry.id, date, on);
    else setItemJournalLink(plan!.id, entry.id, date, on);
  }

  function stillPending(entry: TodayPlanEntry) {
    if (entry.kind === "objective") setObjectiveJournalLink(plan!.id, entry.id, date, false);
    else setItemJournalLink(plan!.id, entry.id, date, false);
    setLeftPending((s) => new Set(s).add(entry.key));
  }

  function Row({ entry }: { entry: TodayPlanEntry }) {
    const ack = leftPending.has(entry.key);
    return (
      <li className={cn("flex items-start gap-2.5 rounded-xl border border-line bg-paper/[0.02] px-3 py-2.5", ack && "opacity-60")}>
        <button
          type="button"
          onClick={() => complete(entry)}
          aria-label={`Mark “${entry.title}” complete`}
          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-paper/35 text-transparent transition-colors hover:border-positive hover:bg-positive hover:text-ink"
        >
          <Check className="h-3 w-3" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-paper">
            {entry.kind === "milestone" && <Flag className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-accent" />}
            {entry.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-paper/55">
            <span className="capitalize">{entry.kind}</span>
            {entry.overdue && entry.targetDate && (
              <span className="inline-flex items-center gap-1 font-semibold text-danger">
                <Clock className="h-3 w-3" /> Overdue since {entry.targetDate}
              </span>
            )}
            {!entry.overdue && entry.targetDate && <span>Today</span>}
            {entry.workedToday && (
              <span className="inline-flex items-center gap-1 text-accent">
                <BookOpen className="h-3 w-3" /> Linked to this journal day
              </span>
            )}
            {ack && <span className="text-paper/45">Left pending</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => workedOn(entry)}
            aria-pressed={entry.workedToday}
            className={cn(
              "rounded-lg px-2 py-1 text-[0.68rem] font-semibold transition-colors",
              entry.workedToday ? "bg-accent/15 text-accent" : "text-paper/55 hover:bg-paper/[0.06] hover:text-paper",
            )}
          >
            {entry.workedToday ? "Worked on today" : "Worked on today"}
          </button>
          <button
            type="button"
            onClick={() => stillPending(entry)}
            className="rounded-lg px-2 py-0.5 text-[0.66rem] text-paper/45 hover:text-paper"
          >
            Still pending
          </button>
        </div>
      </li>
    );
  }

  if (compact) {
    if (view.allDone) {
      return (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-positive/30 bg-positive/[0.06] px-3.5 py-2.5 text-[0.78rem] text-paper/80">
          <Sparkles className="h-4 w-4 shrink-0 text-positive" />
          <span className="font-semibold text-paper">Your weekly plan is done for today.</span>
          <button type="button" onClick={onOpen} className="ml-auto font-semibold text-accent hover:underline">
            See the plan
          </button>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-line bg-paper/[0.02] px-3.5 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-[0.78rem] font-semibold text-paper">Your Weekly Plan Today</p>
          <Link href={`/roadmap?plan=${plan.id}`} className="text-[0.72rem] text-paper/55 hover:text-accent">
            {planName(plan)}
          </Link>
          <span className="tabular ml-auto text-[0.72rem] text-paper/55">
            {view.done}/{view.total} done
          </span>
        </div>
        {nextUp ? (
          <p className="mt-1 truncate text-[0.76rem] text-paper/70">
            {nextUp.overdue ? "Overdue: " : "Next: "}
            {nextUp.title}
            {view.open > 1 ? ` · ${view.open - 1} more open` : ""}
          </p>
        ) : (
          <p className="mt-1 text-[0.76rem] text-paper/60">Nothing is scheduled for today. The week still has open work.</p>
        )}
        <button type="button" onClick={onOpen} className="mt-1 text-[0.72rem] font-semibold text-accent hover:underline">
          Open the Plan tab
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Your Weekly Plan Today</p>
          <h3 className="mt-0.5 text-base font-semibold text-paper">{planName(plan)}</h3>
          <p className="mt-0.5 text-[0.75rem] text-paper/55">
            {plan.start} – {plan.end} · {view.done} of {view.total} pieces done
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-paper/10" aria-hidden>
            <div className="h-full rounded-full bg-accent" style={{ width: `${donePct}%` }} />
          </div>
          <span className="tabular text-[0.72rem] text-paper/55">{donePct}%</span>
        </div>
      </div>

      {view.allDone ? (
        <div className="flex items-center gap-2 rounded-xl border border-positive/30 bg-positive/[0.06] px-4 py-4 text-[0.85rem] text-paper/85">
          <Sparkles className="h-5 w-5 shrink-0 text-positive" />
          <span>
            <span className="font-semibold text-paper">Everything in this week&apos;s plan is done.</span> Well finished — carry only what you choose into
            next week.
          </span>
        </div>
      ) : (
        <>
          {view.scheduled.length > 0 && (
            <section>
              <p className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-paper/55">Scheduled today</p>
              <ul className="space-y-1.5">
                {view.scheduled.map((e) => (
                  <Row key={e.key} entry={e} />
                ))}
              </ul>
            </section>
          )}
          {view.overdue.length > 0 && (
            <section>
              <p className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-danger/80">Slipped from earlier</p>
              <ul className="space-y-1.5">
                {view.overdue.map((e) => (
                  <Row key={e.key} entry={e} />
                ))}
              </ul>
            </section>
          )}
          {view.objectives.length > 0 && (
            <section>
              <p className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-paper/55">The week&apos;s objectives</p>
              <ul className="space-y-1.5">
                {view.objectives.map((e) => (
                  <Row key={e.key} entry={e} />
                ))}
              </ul>
            </section>
          )}
          {view.unscheduled.length > 0 && (
            <section>
              <p className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-paper/55">Also this week</p>
              <ul className="space-y-1.5">
                {view.unscheduled.map((e) => (
                  <Row key={e.key} entry={e} />
                ))}
              </ul>
              {view.hiddenUnscheduled > 0 && (
                <p className="mt-1 text-[0.7rem] text-paper/50">
                  and {view.hiddenUnscheduled} more open {view.hiddenUnscheduled === 1 ? "activity" : "activities"} in the plan.
                </p>
              )}
            </section>
          )}
          {!view.scheduled.length && !view.overdue.length && !view.objectives.length && !view.unscheduled.length && (
            <p className="text-[0.8rem] text-paper/60">
              Nothing is scheduled for this day. Open the plan to add an activity or move one here.
            </p>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Link
          href={`/roadmap?plan=${plan.id}`}
          className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-paper hover:border-paper/25"
        >
          Open in Roadmap <ChevronRight className="h-3.5 w-3.5" />
        </Link>
        <p className="text-[0.7rem] text-paper/50">
          Completing here updates the same Roadmap record. &ldquo;Worked on today&rdquo; links the journal day without finishing it.
        </p>
      </div>
    </div>
  );
}
