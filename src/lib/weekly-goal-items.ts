import type { GoalView } from "./goals";
import { isArchived, planName } from "./roadmap";
import type { ISODate, PlanItem, RoadmapPlan } from "./types";

export interface WeeklyGoalItem {
  planId: string;
  planTitle: string;
  item: PlanItem;
  due: ISODate;
  archived: boolean;
  overdue: boolean;
}

/** Goals reads these directly from Roadmap so edits and progress share one record. */
export function weeklyGoalItems(plans: RoadmapPlan[], today: ISODate): WeeklyGoalItem[] {
  return plans.flatMap((plan) => {
    if (plan.level !== "week") return [];
    const archived = isArchived(plans, plan);
    const planTitle = planName(plan);
    return (plan.items ?? []).flatMap((item) => {
      if (item.kind !== "objective" && item.kind !== "milestone") return [];
      const due = item.targetDate ?? plan.end;
      const overdue = !archived && due < today && (item.status === "notStarted" || item.status === "inProgress");
      return [{ planId: plan.id, planTitle, item, due, archived, overdue }];
    });
  });
}

export function weeklyGoalInView(row: WeeklyGoalItem, view: GoalView): boolean {
  if (view === "all") return true;
  if (row.archived) return false;
  switch (view) {
    case "active":
      return row.item.status === "notStarted" || row.item.status === "inProgress";
    case "overdue":
      return row.overdue;
    case "completed":
      return row.item.status === "completed";
    case "paused":
      return row.item.status === "deferred";
  }
}
