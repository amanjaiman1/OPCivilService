import type { ISODate, PlanItemStatus, RoadmapPlan } from "./types";
import { isArchived } from "./roadmap";

/* ════════════════════════════════════════════════════════════════
   "Your Weekly Plan Today": what the active weekly plan asks of this
   particular day, read from the plan itself.

   The order is deliberate — what was scheduled for today first, then what
   slipped, then the week's objectives, then a short list of open activities
   with no date. History stays out of it: a week from March never follows you
   into June. Pure functions of (plans, today), so the reminder and the tests
   cannot drift apart.
   ════════════════════════════════════════════════════════════════ */

export type TodayPlanKind = "objective" | "activity" | "milestone";

export interface TodayPlanEntry {
  /** Stable row key, unique within the plan. */
  key: string;
  kind: TodayPlanKind;
  id: string;
  title: string;
  status: PlanItemStatus;
  targetDate?: ISODate;
  overdue: boolean;
  /** The journal day already records work on it. Never a completion. */
  workedToday: boolean;
}

export interface WeeklyPlanTodayView {
  plan: RoadmapPlan | null;
  /** Scheduled for today, still open. */
  scheduled: TodayPlanEntry[];
  /** Dated before today, still open. */
  overdue: TodayPlanEntry[];
  /** The week's open objectives. */
  objectives: TodayPlanEntry[];
  /** Open activities with no date, capped for display. */
  unscheduled: TodayPlanEntry[];
  hiddenUnscheduled: number;
  /** Everything finished (objectives, activities, milestones). */
  done: number;
  /** Everything still open, including future-dated work. */
  open: number;
  total: number;
  /** True when the week has work and none of it is still open. */
  allDone: boolean;
}

const EMPTY: WeeklyPlanTodayView = {
  plan: null,
  scheduled: [],
  overdue: [],
  objectives: [],
  unscheduled: [],
  hiddenUnscheduled: 0,
  done: 0,
  open: 0,
  total: 0,
  allDone: false,
};

const UNSCHEDULED_SHOWN = 4;

/** The weekly plan that covers `today`, preferring the most recently touched. */
export function activeWeekPlan(plans: RoadmapPlan[], today: ISODate): RoadmapPlan | null {
  const live = plans.filter(
    (p) => p.level === "week" && !isArchived(plans, p) && p.start <= today && today <= p.end,
  );
  if (!live.length) return null;
  return [...live].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function entryOf(
  planId: string,
  kind: TodayPlanKind,
  id: string,
  title: string,
  status: PlanItemStatus,
  today: ISODate,
  options: { targetDate?: ISODate; journalDates?: ISODate[] } = {},
): TodayPlanEntry {
  return {
    key: `${planId}:${kind}:${id}`,
    kind,
    id,
    title,
    status,
    ...(options.targetDate ? { targetDate: options.targetDate } : {}),
    overdue: Boolean(options.targetDate && options.targetDate < today && status !== "completed" && status !== "deferred"),
    workedToday: Boolean(options.journalDates?.includes(today)),
  };
}

/**
 * Reads one day out of the active weekly plan. Completed and deferred work is
 * counted but never listed as something to do; nothing here changes a record.
 */
export function weeklyPlanToday(plans: RoadmapPlan[], today: ISODate): WeeklyPlanTodayView {
  const plan = activeWeekPlan(plans, today);
  if (!plan) return EMPTY;

  const scheduled: TodayPlanEntry[] = [];
  const overdue: TodayPlanEntry[] = [];
  const unscheduled: TodayPlanEntry[] = [];
  const objectives: TodayPlanEntry[] = [];
  let done = 0;
  let open = 0;

  for (const o of plan.objectives ?? []) {
    if (o.status === "completed") done++;
    else if (o.status === "deferred") continue;
    else {
      open++;
      objectives.push(entryOf(plan.id, "objective", o.id, o.title, o.status, today, { targetDate: o.targetDate, journalDates: o.journalDates }));
    }
  }

  for (const it of plan.items ?? []) {
    if (it.status === "completed") done++;
    else if (it.status === "deferred") continue;
    else {
      open++;
      const entry = entryOf(plan.id, it.kind, it.id, it.title, it.status, today, {
        targetDate: it.targetDate,
        journalDates: it.journalDates,
      });
      if (it.targetDate === today) scheduled.push(entry);
      else if (it.targetDate && it.targetDate < today) overdue.push(entry);
      else if (!it.targetDate && it.kind === "activity") unscheduled.push(entry);
    }
  }

  overdue.sort((a, b) => (a.targetDate ?? "").localeCompare(b.targetDate ?? ""));
  const shownUnscheduled = unscheduled.slice(0, UNSCHEDULED_SHOWN);

  return {
    plan,
    scheduled,
    overdue,
    objectives,
    unscheduled: shownUnscheduled,
    hiddenUnscheduled: Math.max(0, unscheduled.length - shownUnscheduled.length),
    done,
    open,
    total: done + open,
    allDone: done > 0 && open === 0,
  };
}

/** True when the row is already linked to the journal day. */
export function isWorkedToday(entry: Pick<TodayPlanEntry, "workedToday">): boolean {
  return entry.workedToday;
}
