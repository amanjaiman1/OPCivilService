"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useChronicle } from "@/lib/store";
import { formatDay, periodLabel, planName, suggestsWeeklyTarget, weeklyTargets, type WeeklyTargetIntent } from "@/lib/roadmap";
import type { JournalEntry, PlanItem, RoadmapPlan } from "@/lib/types";

export function WeeklyTargets({ entry, changes, onChange, className }: {
  className?: string;
  entry: JournalEntry;
  changes: WeeklyTargetIntent[];
  onChange: (changes: WeeklyTargetIntent[]) => void;
}) {
  const plans = useChronicle((state) => state.plans);
  const groups = useMemo(() => weeklyTargets(plans, entry.date), [plans, entry.date]);
  const matches = (change: WeeklyTargetIntent, plan: RoadmapPlan, item: PlanItem) =>
    change.planId === plan.id && change.itemId === item.id;
  const unavailable = changes.filter((change) => !groups.some(({ plan, items }) => items.some((item) => matches(change, plan, item))));
  if (!groups.length && !unavailable.length) return null;

  return (
    <section aria-label="Your weekly targets" className={cn("space-y-3", className)}>
      <div>
        <h3 className="text-sm font-semibold text-paper">Your weekly targets</h3>
        <p className="mt-1 text-xs text-paper/65">Check off the work you finished on this day.</p>
      </div>
      {groups.map(({ plan, items }) => (
        <fieldset key={plan.id} className="min-w-0 space-y-1 rounded-xl border border-line px-3 pb-2">
          <legend className="max-w-full px-1 text-xs font-semibold text-paper/75">{planName(plan)} · {periodLabel(plan)}</legend>
          {items.map((item) => {
            const change = changes.find((intent) => matches(intent, plan, item));
            const done = item.status === "completed";
            const changed = change && (change.expectedStatus !== item.status || change.expectedCompletedAt !== item.completedAt ||
              (change.expectedTitle !== undefined && (change.expectedTitle !== item.title || change.expectedTargetDate !== item.targetDate)));
            const detail = !item.targetDate ? "Remaining weekly work"
              : item.targetDate === entry.date ? "Due this day"
              : item.targetDate < entry.date ? `Overdue · ${formatDay(item.targetDate)}`
              : `Upcoming · ${formatDay(item.targetDate)}`;
            return (
              <label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-paper/[0.05]">
                <input
                  type="checkbox"
                  checked={change?.complete ?? done}
                  onChange={(event) => {
                    const complete = event.target.checked;
                    const remaining = changes.filter((intent) => !matches(intent, plan, item));
                    onChange(complete === done ? remaining : [...remaining, {
                      planId: plan.id, itemId: item.id, complete,
                      expectedStatus: item.status, expectedCompletedAt: item.completedAt,
                      expectedTitle: item.title, expectedTargetDate: item.targetDate,
                    }]);
                  }}
                  className="h-5 w-5 shrink-0 accent-[rgb(var(--accent))]"
                />
                <span className="min-w-0">
                  <span className="block break-words text-sm text-paper">{item.title}</span>
                  <span className="block text-xs capitalize text-paper/60">
                    {item.kind} · {done ? "Completed" : detail}
                    {!done && suggestsWeeklyTarget(item, entry.completedTopics) && " · Matches a topic you logged"}
                    {changed && " · Changed elsewhere"}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
      {unavailable.length > 0 && (
        <div role="status" className="text-xs text-warning">
          Some selected targets changed elsewhere.{" "}
          <button type="button" className="underline" onClick={() => onChange(changes.filter((change) => !unavailable.includes(change)))}>
            Clear unavailable selections
          </button>
        </div>
      )}
    </section>
  );
}
