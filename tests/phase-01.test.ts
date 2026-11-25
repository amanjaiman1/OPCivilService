import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "./memory-storage";
import { setActiveAccount, setStorageBackend } from "@/lib/account/scope";
import { blankChronicleState, useChronicle } from "@/lib/store";
import { activityEvents, habitContext, todayHabits } from "@/lib/habit-engine";
import { evaluate } from "@/lib/notifications";
import { groupGoalProgress } from "@/lib/goals";
import { measurePeriod, periodOfReview } from "@/lib/performance";
import { merge3 } from "@/lib/sync/merge";
import { chronicleStoreAdapter } from "@/lib/sync/store-adapter";
import {
  addDays, applyWeeklyTargets, blankItem, blankPlan, carryForward, duplicatePlan,
  normalizePlans, ownCounts, weeklyTargets, weekStartOf, type WeeklyTargetIntent,
} from "@/lib/roadmap";
import { newRevisionItem } from "@/lib/revision";
import { fromISODate, toISODate } from "@/lib/utils";
import type { Goal, Habit, JournalEntry, PlanItem, RoadmapPlan, Subject } from "@/lib/types";

const today = toISODate(new Date());
const yesterday = addDays(today, -1);
const store = () => useChronicle.getState();
const subjects: Subject[] = [
  { id: "polity", name: "Polity", paper: "GS2", topics: [
    { id: "rights", name: "Fundamental Rights", confidence: 0, revisionCount: 0, status: "untouched" },
  ] },
  { id: "history", name: "History", paper: "GS1", topics: [] },
];
const journal = (date = today, fields: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `day-${date}`, date, blocks: [{ subjectId: "polity", hours: 1.5 }],
  totalHours: 1.5, mood: 4, energy: 4, motivation: 4, focus: 4, ...fields,
});
const habit: Habit = {
  id: "revision-habit", name: "Daily revision", source: "revision", metric: "revisionPasses",
  cadence: "daily", createdOn: addDays(today, -14), log: {},
};
const week = (items: PlanItem[] = [], over: Partial<RoadmapPlan> = {}): RoadmapPlan => ({
  ...blankPlan("week", { start: weekStartOf(yesterday) }), items, ...over,
});
const intent = (plan: RoadmapPlan, item: PlanItem, complete = true): WeeklyTargetIntent => ({
  planId: plan.id, itemId: item.id, expectedStatus: item.status,
  expectedCompletedAt: item.completedAt, expectedTitle: item.title, expectedTargetDate: item.targetDate, complete,
});
const revisionEvents = () => activityEvents(store()).filter((event) => event.kind === "revisionPass");

beforeEach(() => {
  setStorageBackend(new MemoryStorage() as unknown as Storage);
  setActiveAccount(null);
  useChronicle.setState({ ...blankChronicleState(), subjects: structuredClone(subjects), habits: [habit] });
});

test("journal resolves unique exact names within the chosen subject and schedules custom topics by default", () => {
  const input = journal(yesterday, { completedTopics: [
    { id: "a", name: "  fundamental  RIGHTS  ", subjectId: "polity" },
    { id: "b", name: "Fundamental Rights", subjectId: "history" },
    { id: "c", name: " FUNDAMENTAL rights ", subjectId: "history" },
    { id: "d", name: "Unassigned note" },
  ] });
  const saved = store().saveJournalEntry({ entry: input });
  assert.equal(saved.topicsCredited, 2);
  assert.equal(saved.revisionsScheduled, 2);
  const [polity, history] = store().subjects;
  assert.equal(polity.topics.length, 1);
  assert.equal(history.topics.length, 1);
  assert.equal(polity.topics[0].status, "learning");
  assert.equal(history.topics[0].revisionCount, 0);
  assert.equal(store().journal[0].completedTopics?.length, 3);
  assert.equal(store().journal[0].completedTopics?.[2].subjectId, undefined);
  assert.equal(store().revisions[0].nextDue, today);
  assert.equal(store().saveJournalEntry({ entry: input }).revisionsScheduled, 0);
  assert.equal(store().revisions.length, 2);
});

test("legacy queue names link to canonical topics and survive rename, journal correction and deletion", () => {
  const old = { ...newRevisionItem("polity", " fundamental  rights ", fromISODate(yesterday)), id: "rev-old", lastRevised: yesterday, repetitions: 2 };
  useChronicle.setState({ revisions: [old] });
  const initial = journal(today, { completedTopics: [{ id: "first", name: "Fundamental Rights", subjectId: "polity" }] });
  store().saveJournalEntry({ entry: initial });
  store().updateTopic("polity", "rights", { name: "Fundamental freedoms" });
  store().saveJournalEntry({ entry: journal(today, { completedTopics: [{ id: "another", name: "Fundamental freedoms", subjectId: "polity" }] }) });
  store().deleteJournal(today);
  assert.deepEqual(store().revisions, [{ ...old, topicId: "rights", topic: "Fundamental freedoms" }]);
  assert.equal(store().subjects[0].topics[0].status, "learning");
});

test("ambiguity fails before writing and queue opt-out stays explicit", () => {
  const state = store();
  state.addTopic("polity", "Another chapter");
  state.updateTopic("polity", store().subjects[0].topics[1].id, { name: "Fundamental Rights" });
  const entry = journal(today, { completedTopics: [{ id: "tc", name: "Fundamental Rights", subjectId: "polity" }] });
  assert.throws(() => store().saveJournalEntry({ entry }), /Several topics match/);
  assert.equal(store().journal.length, 0);
  store().saveJournalEntry({ entry: { ...entry, completedTopics: [{ id: "tc", name: "Fundamental Rights", subjectId: "polity", topicId: "rights" }] }, scheduleRevision: false });
  assert.equal(store().subjects[0].topics[0].status, "learning");
  assert.equal(store().revisions.length, 0);
});

test("two offline clients create one custom topic, queue item and same-day completion", () => {
  const adapter = chronicleStoreAdapter("student");
  const base = adapter.read();
  const write = (name: string) => {
    store().saveJournalEntry({ entry: journal(today, { completedTopics: [{ id: name, name, subjectId: "history" }] }) });
    return adapter.read();
  };
  const local = write("Article 123");
  store().applyCloudSnapshot(base);
  const remote = write(" article  123 ");
  const { value } = merge3(base, local, remote);
  store().applyCloudSnapshot(value);
  assert.equal(store().subjects[1].topics.length, 1);
  assert.equal(store().journal[0].completedTopics?.length, 1);
  assert.equal(store().revisions.length, 1);
  assert.equal(store().revisions[0].topicId, store().journal[0].completedTopics?.[0].topicId);
});

test("revision history has one pass per item/day and standard habits stop reminding immediately", () => {
  const queue = { ...newRevisionItem("polity", "Fundamental Rights"), id: "queue" };
  useChronicle.setState({ revisions: [queue] });
  const now = fromISODate(today);
  now.setHours(20);
  const reminder = () => evaluate(store(), { now }).some((notice) => notice.ruleId === "habits-pending");
  assert.equal(reminder(), true);
  store().reviseItem(queue.id, false);
  store().saveJournalEntry({ entry: journal(today, { revisionSessions: [
    { topic: queue.topic, subjectId: "polity", revisionItemId: queue.id },
    { topic: " fundamental Rights " },
  ] }) });
  assert.equal(revisionEvents().length, 1);
  assert.equal(reminder(), false);
  const advanced = { ...habit, id: "advanced", target: 2 };
  assert.deepEqual(todayHabits([habit, advanced], habitContext(store(), today)).map((item) => item.done), [true, false]);
  store().deleteJournal(today);
  assert.equal(revisionEvents().length, 1, "a Revision-page pass survives journal deletion");
});

test("journal-only revision corrections affect habit history, while backfills preserve the current queue", () => {
  const queue = { ...newRevisionItem("polity", "Fundamental Rights"), id: "queue" };
  useChronicle.setState({ revisions: [queue] });
  const revision = { topic: queue.topic, subjectId: "polity", revisionItemId: queue.id };
  store().saveJournalEntry({ entry: journal(today, { revisionSessions: [revision] }) });
  const due = store().revisions[0].nextDue;
  store().saveJournalEntry({ entry: journal(yesterday, { revisionSessions: [revision, { topic: "Independent reading" }] }) });
  assert.equal(store().revisions[0].nextDue, due);
  assert.equal(store().revisions[0].lastRevised, today);
  assert.equal(revisionEvents().filter((event) => event.date === yesterday).length, 2);
  store().saveJournalEntry({ entry: journal(today, { revisionSessions: [] }) });
  assert.equal(todayHabits([habit], habitContext(store(), today))[0].done, false);
  assert.equal(store().revisions[0].nextDue, due);
});

test("legacy weekly objectives migrate with stable identities, order and no invented completions", () => {
  const raw = week([], { objectives: ["First reading", "Solve questions", "First reading"] });
  const [migrated] = normalizePlans([raw]);
  assert.deepEqual(migrated.items?.map((item) => item.title), raw.objectives);
  assert.equal(new Set(migrated.items?.map((item) => item.id)).size, 3);
  assert(migrated.items?.every((item) => item.kind === "objective" && item.status === "notStarted"));
  assert.deepEqual(normalizePlans([migrated]), [migrated]);
  const prepare = chronicleStoreAdapter("student").prepareMerge!;
  const changed = { ...migrated, title: "Renamed plan" };
  store().savePlan(migrated);
  const [first, second] = migrated.items!;
  store().setPlanItemStatus(migrated.id, first.id, "completed");
  const remote = prepare({ plans: [{ ...raw, title: changed.title }] });
  const forked = structuredClone(migrated);
  forked.items![1].subjectId = "polity";
  const result = merge3(prepare({ plans: [raw] }), { plans: store().plans }, remote);
  const [plan] = normalizePlans(result.value.plans);
  assert.equal(plan.title, changed.title);
  assert.equal(plan.items?.[0].status, "completed");
  const concurrent = merge3({ plans: [migrated] }, { plans: store().plans }, { plans: [forked] });
  const [merged] = normalizePlans(concurrent.value.plans);
  assert.equal(merged.items?.find((item) => item.id === second.id)?.subjectId, "polity");
});

test("weekly targets use saved week spans, sort by urgency and reject stale edits atomically", () => {
  const start = addDays(today, -2);
  const objective = blankItem("objective", "Complete reading");
  const dated = { ...blankItem("activity", "Dated today"), targetDate: today };
  const late = { ...blankItem("activity", "Overdue"), targetDate: yesterday };
  const milestone = { ...blankItem("milestone", "Upcoming"), targetDate: addDays(today, 1) };
  const archived = week([objective], { start, end: addDays(start, 6), archivedAt: new Date().toISOString() });
  const plan = week([objective, milestone, late, dated, { ...blankItem("activity", "Future"), targetDate: addDays(today, 1) }], { start, end: addDays(start, 6) });
  const other = week([blankItem("objective", "Overlap")], { start: yesterday, end: addDays(yesterday, 6) });
  const groups = weeklyTargets([other, archived, plan], today);
  assert.deepEqual(groups.map(({ plan }) => plan.id), [plan.id, other.id]);
  assert.deepEqual(groups[0].items.map((item) => item.id), [dated.id, late.id, objective.id, milestone.id]);
  store().savePlan(plan);
  store().setPlanItemStatus(plan.id, dated.id, "inProgress");
  assert.throws(() => store().saveJournalEntry({ entry: journal(), weeklyTargets: [intent(plan, objective), intent(plan, dated)] }), /changed elsewhere/);
  assert.equal(store().journal.length, 0);
  assert.equal(store().plans[0].items?.find((item) => item.id === objective.id)?.status, "notStarted");
});

test("standalone work can complete without creating a journal, and an entry links completed work on its own date", () => {
  const objective = blankItem("objective", "Complete notes");
  const milestone = blankItem("milestone", "Reach first checkpoint");
  const activity = blankItem("activity", "Practice questions");
  const plan = week([objective, milestone, activity]);
  assert(store().savePlan(plan));
  store().completeWeeklyTargets(yesterday, [intent(plan, objective)]);
  assert.equal(store().journal.length, 0);
  store().saveJournalEntry({ entry: journal(yesterday), weeklyTargets: [intent(plan, milestone), intent(plan, activity)] });
  const current = store().plans[0];
  assert.equal(current.items?.[0].completedOn, yesterday);
  assert.deepEqual(current.items?.[1].journalDates, [yesterday]);
  assert.equal(applyWeeklyTargets(store().plans, [intent(plan, activity)], yesterday, true), store().plans);
  const counts = ownCounts(store().plans, current, today);
  assert.deepEqual([counts.completed, counts.objectivesDone, counts.milestonesDone], [1, 1, 1]);
  assert.equal(activityEvents(store()).find((event) => event.kind === "roadmapActivity")?.date, yesterday);

  store().savePlanReview(plan.id, {});
  const snapshot = store().plans[0].review?.snapshot;
  assert.deepEqual(snapshot?.objectives, ["Complete notes"]);
  assert.deepEqual(snapshot?.milestones, ["Reach first checkpoint"]);
  assert.equal(snapshot?.studyHours, 1.5);
  const measured = measurePeriod(store(), periodOfReview({ type: "Weekly", startDate: current.start, endDate: current.end }), today);
  assert.deepEqual(measured.roadmap.objectives, { planned: 1, completed: 1 });
  store().setPlanItemStatus(plan.id, milestone.id, "notStarted");
  assert.deepEqual(store().plans[0].review?.snapshot, snapshot);
});

test("duplicate and carry-forward keep objective type, reset completion, and respect archive restrictions", () => {
  const objective = blankItem("objective", "Carry me");
  const plan = week([objective]);
  const next = duplicatePlan(plan, { start: addDays(plan.start, 7) });
  assert.notEqual(next.items?.[0].id, objective.id);
  assert.equal(next.items?.[0].kind, "objective");
  const result = carryForward([plan, { ...next, items: [] }], plan.id, [objective.id], next.id);
  assert.equal(result.moved, 1);
  assert.equal(result.plans[0].items?.[0].status, "deferred");
  assert.equal(result.plans[1].items?.[0].kind, "objective");
  const archived = { ...plan, archivedAt: plan.createdAt };
  assert.throws(() => applyWeeklyTargets([archived], [intent(plan, objective)], yesterday, false));
  assert.equal(carryForward([archived, next], plan.id, [objective.id], next.id).moved, 0);
});

test("goal groups preserve sorted input and place uncategorized legacy records using their metric", () => {
  const goal = (id: string, fields: Partial<Goal>): Goal => ({
    id, title: id, horizon: "Weekly", metric: "studyHours", target: 1, status: "Active", createdOn: today, ...fields,
  });
  const rows = [
    { goal: goal("revision", { metric: "revisionPasses" }) },
    { goal: goal("first study", { category: "Study" }) },
    { goal: goal("second study", { status: "Completed" }) },
    { goal: goal("health", { category: "Health" }) },
  ];
  assert.deepEqual(groupGoalProgress(rows).map(({ category, records }) => [category, records.map((row) => row.goal.id)]), [
    ["Study", ["first study", "second study"]], ["Revision", ["revision"]], ["Health", ["health"]],
  ]);
});
