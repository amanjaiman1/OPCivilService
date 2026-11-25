import { test } from "node:test";
import assert from "node:assert/strict";
import type { RoadmapPlan } from "@/lib/types";
import { blankItem, blankObjective, blankPlan } from "@/lib/roadmap";
import { activeWeekPlan, weeklyPlanToday } from "@/lib/plan-today";

const T = "2027-03-08T09:00:00.000Z";
const TODAY = "2027-03-10";
const WEEK = { start: "2027-03-08" };

const week = (over: Partial<RoadmapPlan> = {}): RoadmapPlan => ({ ...blankPlan("week", WEEK, T), ...over });

function plan(): RoadmapPlan {
  return week({
    updatedAt: "2027-03-09T12:00:00.000Z",
    objectives: [
      { ...blankObjective("Finish Polity", T), status: "inProgress" },
      { ...blankObjective("Four mocks", T), status: "completed", completedAt: "2027-03-09T10:00:00.000Z" },
      { ...blankObjective("Optional notes", T), status: "deferred" },
    ],
    items: [
      { ...blankItem("activity", "Read Article 21", T), targetDate: TODAY },
      { ...blankItem("milestone", "Unit 3 test", T), targetDate: TODAY },
      { ...blankItem("activity", "Revise Mughals", T), targetDate: "2027-03-09" },
      { ...blankItem("activity", "Extra answer", T), targetDate: "2027-03-08" },
      { ...blankItem("activity", "Unscheduled A", T) },
      { ...blankItem("activity", "Unscheduled B", T) },
      { ...blankItem("activity", "Unscheduled C", T) },
      { ...blankItem("activity", "Unscheduled D", T) },
      { ...blankItem("activity", "Unscheduled E", T) },
      { ...blankItem("milestone", "Later milestone", T), targetDate: "2027-03-13" },
      { ...blankItem("activity", "Done today", T), targetDate: TODAY, status: "completed" },
      { ...blankItem("activity", "Deliberately deferred", T), targetDate: TODAY, status: "deferred" },
      { ...blankItem("activity", "Worked on", T), targetDate: TODAY, journalDates: [TODAY] },
    ],
  });
}

test("without an active weekly plan the reminder is empty and quiet", () => {
  assert.equal(activeWeekPlan([], TODAY), null);
  const empty = weeklyPlanToday([], TODAY);
  assert.equal(empty.plan, null);
  assert.equal(empty.allDone, false);
  assert.deepEqual(empty.scheduled, []);
});

test("only the week covering today counts; archived and other weeks are ignored", () => {
  const archived = week({ start: "2027-03-08", archivedAt: T });
  const other = week({ start: "2027-03-15" });
  assert.equal(activeWeekPlan([archived, other], TODAY), null);
  assert.equal(activeWeekPlan([archived, other, week()], TODAY)?.start, "2027-03-08");
  // A week under an archived month is archived with it, even without its own stamp.
  const month = blankPlan("month", { month: "2027-03" }, T);
  const inArchivedMonth = week({ start: "2027-03-08", parentId: month.id });
  assert.equal(activeWeekPlan([{ ...month, archivedAt: T }, inArchivedMonth], TODAY), null);
});

test("today, slipped, objectives and a capped unscheduled list are read from the plan", () => {
  const view = weeklyPlanToday([plan()], TODAY);
  assert.equal(view.plan?.start, "2027-03-08");
  assert.deepEqual(view.scheduled.map((e) => e.title), ["Read Article 21", "Unit 3 test", "Worked on"]);
  assert.deepEqual(view.overdue.map((e) => e.title), ["Extra answer", "Revise Mughals"], "oldest slip first");
  assert.deepEqual(view.objectives.map((e) => e.title), ["Finish Polity"], "completed and deferred objectives are not asked for");
  assert.deepEqual(view.unscheduled.map((e) => e.title), ["Unscheduled A", "Unscheduled B", "Unscheduled C", "Unscheduled D"]);
  assert.equal(view.hiddenUnscheduled, 1);
  assert.equal(view.done, 2, "one objective and one activity are finished");
  assert.equal(view.open, 12, "every still-open objective and item counts, including future-dated work");
  assert.equal(view.total, 14);
  assert.equal(view.allDone, false);
  assert.equal(view.scheduled.find((e) => e.title === "Worked on")?.workedToday, true);
  assert.equal(view.scheduled.find((e) => e.title === "Read Article 21")?.workedToday, false);
});

test("an open future date keeps the week unfinished but is not listed as today's work", () => {
  const p = week({
    items: [
      { ...blankItem("activity", "Done", T), targetDate: TODAY, status: "completed" },
      { ...blankItem("milestone", "Later", T), targetDate: "2027-03-13" },
    ],
  });
  const view = weeklyPlanToday([p], TODAY);
  assert.equal(view.open, 1);
  assert.equal(view.scheduled.length, 0);
  assert.equal(view.allDone, false);
});

test("a week whose work is all done or deferred congratulates, while an empty week does not", () => {
  const done = week({
    objectives: [{ ...blankObjective("One", T), status: "completed", completedAt: T }],
    items: [
      { ...blankItem("activity", "A", T), status: "completed" },
      { ...blankItem("activity", "B", T), status: "deferred" },
    ],
  });
  assert.equal(weeklyPlanToday([done], TODAY).allDone, true);
  assert.equal(weeklyPlanToday([week()], TODAY).allDone, false, "nothing planned is not 'all done'");
});

test("duplicate plans for the week resolve to the most recently updated one", () => {
  const older = week({ updatedAt: "2027-03-08T10:00:00.000Z", title: "Older" });
  const newer = week({ updatedAt: "2027-03-09T10:00:00.000Z", title: "Newer" });
  assert.equal(activeWeekPlan([older, newer], TODAY)?.title, "Newer");
});
