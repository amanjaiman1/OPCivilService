import { test } from "node:test";
import assert from "node:assert/strict";
import type { Goal } from "@/lib/types";
import { blankItem, blankPlan, withStatus } from "@/lib/roadmap";
import { weeklyGoalInView, weeklyGoalItems } from "@/lib/weekly-goal-items";
import {
  byPriority,
  computeGoalProgress,
  goalCategory,
  goalViewCounts,
  inGoalView,
  validateGoal,
  type GoalData,
} from "@/lib/goals";

const TODAY = "2026-11-15";
const empty: GoalData = {
  journal: [],
  subjects: [],
  mocks: [],
  revisions: [],
  books: [],
  currentAffairs: [],
  reflections: [],
  mistakes: [],
  lifeLog: [],
};

const goal = (over: Partial<Goal>): Goal => ({
  id: "g",
  title: "A goal",
  horizon: "Weekly",
  metric: "manual",
  target: 10,
  current: 0,
  status: "Active",
  createdOn: "2026-11-01",
  ...over,
});

test("weekly roadmap objectives and milestones appear in Goals with their current Roadmap status", () => {
  const month = { ...blankPlan("month", { month: "2026-11" }), archivedAt: "2026-11-15T12:00:00Z" };
  const archive = { ...blankPlan("week", { start: "2026-11-16" }), parentId: month.id, items: [blankItem("milestone", "Archived checkpoint")] };
  const objective = blankItem("objective", "Complete a practice set");
  const milestone = { ...blankItem("milestone", "Finish revision"), targetDate: TODAY };
  const week = {
    ...blankPlan("week", { start: "2026-11-02" }),
    items: [objective, milestone, blankItem("activity", "Read notes")],
  };
  month.items = [blankItem("milestone", "Monthly checkpoint")];
  const plans = [week, month, archive];
  const rows = weeklyGoalItems(plans, TODAY);
  assert.deepEqual(rows.map((row) => row.item.title), [objective.title, milestone.title, "Archived checkpoint"]);
  assert.deepEqual(rows.filter((row) => weeklyGoalInView(row, "overdue")).map((row) => row.item.id), [objective.id]);
  assert.deepEqual(rows.filter((row) => weeklyGoalInView(row, "active")).map((row) => row.item.id), [objective.id, milestone.id]);
  assert.equal(weeklyGoalInView(rows[2], "all"), true);

  const updatedWeek = { ...week, items: [withStatus({ ...objective, title: "Practice set done" }, "completed")] };
  const updated = weeklyGoalItems([updatedWeek, month, archive], TODAY);
  assert.deepEqual(updated.filter((row) => weeklyGoalInView(row, "completed")).map((row) => row.item.title), ["Practice set done"]);
  assert.equal(updated.some((row) => row.item.id === milestone.id), false);
});

test("a milestone goal's progress is the share of its steps done", () => {
  const g = goal({
    metric: "milestones",
    target: 0,
    milestones: [
      { id: "a", title: "Part 1", doneOn: "2026-11-10" },
      { id: "b", title: "Part 2" },
      { id: "c", title: "Part 3" },
      { id: "d", title: "Part 4", doneOn: "2026-11-12" },
    ],
  });
  const p = computeGoalProgress(g, empty, TODAY);
  assert.equal(p.target, 4, "the target is the number of steps, whatever was typed");
  assert.equal(p.current, 2);
  assert.equal(p.pct, 50);
  const none = computeGoalProgress(goal({ metric: "milestones" }), empty, TODAY);
  assert.equal(none.health, "unmeasurable");
});

test("views: overdue goals are active ones past their date; completed and paused have their own", () => {
  const all = [
    goal({ id: "late", horizon: "Long-term", deadline: "2026-11-10" }),
    goal({ id: "fine", horizon: "Long-term", deadline: "2026-12-10" }),
    goal({ id: "done", status: "Completed" }),
    goal({ id: "rest", status: "Paused" }),
  ].map((g) => computeGoalProgress(g, empty, TODAY));
  const counts = goalViewCounts(all);
  assert.deepEqual(counts, { active: 2, overdue: 1, completed: 1, paused: 1, all: 4 });
  assert.deepEqual(all.filter((p) => inGoalView(p, "overdue")).map((p) => p.goal.id), ["late"]);
});

test("priority sorts high first and the category follows the measure until chosen", () => {
  const list = [
    goal({ id: "low", priority: "Low" }),
    goal({ id: "high", priority: "High" }),
    goal({ id: "medium" }),
  ].map((g) => computeGoalProgress(g, empty, TODAY));
  assert.deepEqual([...list].sort(byPriority).map((p) => p.goal.id), ["high", "medium", "low"]);
  assert.equal(goalCategory(goal({ metric: "mocksTaken" })), "Mock tests");
  assert.equal(goalCategory(goal({ metric: "mocksTaken", category: "Personal" })), "Personal");
});

test("goal validation flags each problem next to its field", () => {
  assert.deepEqual(validateGoal(goal({}), TODAY, true), {});
  assert.ok(validateGoal(goal({ title: "  " }), TODAY, true).title);
  assert.ok(validateGoal(goal({ target: -1 }), TODAY, true).target);
  assert.ok(validateGoal(goal({ metric: "mockAverage", target: 120 }), TODAY, true).target, "a percentage over 100");
  assert.ok(validateGoal(goal({ metric: "subjectHours" }), TODAY, true).subject);
  assert.ok(validateGoal(goal({ metric: "milestones", milestones: [{ id: "a", title: " " }] }), TODAY, true).milestones);
  assert.ok(validateGoal(goal({ deadline: "2026-11-01" }), TODAY, true).deadline, "a new goal can't be due in the past");
  assert.equal(validateGoal(goal({ deadline: "2026-11-05" }), TODAY, false).deadline, undefined, "an existing one can stay overdue");
});
