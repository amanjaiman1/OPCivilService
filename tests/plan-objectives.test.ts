import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { PlanItem, PlanObjective, RoadmapPlan } from "@/lib/types";
import { MemoryStorage } from "./memory-storage";
import { setActiveAccount, setStorageBackend } from "@/lib/account/scope";
import { useChronicle, blankChronicleState } from "@/lib/store";
import {
  LIMITS,
  blankItem,
  blankPlan,
  normalizeObjectives,
  normalizePlans,
  planReviewFacts,
  withObjectiveJournalDate,
} from "@/lib/roadmap";
import { merge3 } from "@/lib/sync/merge";

const T = "2027-01-01T09:00:00.000Z";
const store = () => useChronicle.getState();

const week = (start: string, over: Partial<RoadmapPlan> = {}): RoadmapPlan => ({
  ...blankPlan("week", { start }, T),
  ...over,
});

const objective = (over: Partial<PlanObjective> = {}): PlanObjective => ({
  id: "o1",
  title: "Finish the syllabus",
  status: "notStarted",
  createdAt: T,
  ...over,
});

const act = (title: string, over: Partial<PlanItem> = {}): PlanItem => ({
  ...blankItem("activity", title, T),
  ...over,
});

beforeEach(() => {
  setStorageBackend(new MemoryStorage() as unknown as Storage);
  setActiveAccount(null);
  useChronicle.setState(blankChronicleState());
});

/* ── old snapshots: strings become records ─────────────────────── */

test("old string objectives keep their text and order, and every device derives the same ids", () => {
  const raw = ["  Economy  ", "Polity", "Economy"];
  const a = normalizeObjectives(raw, "m1", T);
  const b = normalizeObjectives(structuredClone(raw), "m1", T);
  assert.deepEqual(a.map((o) => o.title), ["Economy", "Polity", "Economy"], "text trimmed, order kept");
  assert.deepEqual(a, b, "same input, same records and ids on any device");
  assert.ok(a.every((o) => /^po_/.test(o.id)), "ids are derived, not random");
  assert.equal(new Set(a.map((o) => o.id)).size, 3, "different positions stay distinct");
  assert.ok(a.every((o) => o.status === "notStarted"), "an old string carries no completion claim");
});

test("a different plan or title yields a different derived id, so two plans never collide", () => {
  const [one] = normalizeObjectives(["Economy"], "m1", T);
  const [two] = normalizeObjectives(["Economy"], "m2", T);
  assert.notEqual(one.id, two.id);
});

test("records from another device keep their status, dates and completion time", () => {
  const [o] = normalizeObjectives(
    [
      {
        id: "keep-me",
        title: "  Read the report ",
        status: "completed",
        createdAt: T,
        description: "  two chapters ",
        targetDate: "2027-01-09",
        journalDates: ["2027-01-09", "2027-01-05", "2027-01-09", "not-a-date"],
      },
    ],
    "m1",
    T,
  );
  assert.equal(o.id, "keep-me");
  assert.equal(o.title, "Read the report");
  assert.equal(o.status, "completed");
  assert.equal(o.completedAt, T, "a completed record with no stamp falls back to when it was made");
  assert.equal(o.description, "two chapters");
  assert.equal(o.targetDate, "2027-01-09");
  assert.deepEqual(o.journalDates, ["2027-01-05", "2027-01-09"], "deduped and sorted, junk dropped");
});

test("two objectives with the same id are both kept, the clash renamed", () => {
  const out = normalizeObjectives(
    [
      { id: "same", title: "First" },
      { id: "same", title: "Second" },
    ],
    "m1",
    T,
  );
  assert.deepEqual(out.map((o) => o.title), ["First", "Second"]);
  assert.notEqual(out[0].id, out[1].id);
});

test("an older snapshot's objectives survive normalisation once and again", () => {
  const raw = [
    { id: "m1", level: "month", start: "2027-02-10", end: "2027-02-02", objectives: [" Economy ", "Polity"] },
  ];
  const once = normalizePlans(raw);
  const twice = normalizePlans(structuredClone(once));
  assert.deepEqual(once, twice, "idempotent");
  assert.deepEqual(once[0].objectives?.map((o) => o.title), ["Economy", "Polity"]);
});

/* ── adding, completing, reopening ─────────────────────────────── */

test("adding an objective does not complete it; the store keeps a real record", () => {
  store().savePlan(week("2027-01-04"));
  const planId = store().plans[0].id;
  const id = store().addPlanObjective(planId, "  Finish GS2 revision  ");
  assert.ok(id);
  const saved = store().plans[0].objectives!.find((o) => o.id === id)!;
  assert.equal(saved.title, "Finish GS2 revision");
  assert.equal(saved.status, "notStarted");
  assert.equal(saved.completedAt, undefined, "added is not done");
  assert.equal(store().addPlanObjective(planId, "   "), null, "blank is refused");
});

test("completing stamps the time, reopening clears it and keeps everything else", () => {
  store().savePlan(week("2027-01-04"));
  const planId = store().plans[0].id;
  store().addPlanObjective(planId, "Read the report");
  const id = store().plans[0].objectives![0].id;

  store().setPlanObjectiveStatus(planId, id, "completed");
  let o = store().plans[0].objectives![0];
  assert.equal(o.status, "completed");
  assert.ok(o.completedAt, "completion is dated");

  store().setPlanObjectiveStatus(planId, id, "inProgress");
  o = store().plans[0].objectives![0];
  assert.equal(o.status, "inProgress");
  assert.equal(o.completedAt, undefined, "reopening is deliberate and clears the stamp");
  assert.equal(o.title, "Read the report");
});

test("saving an objective through the form stamps completion once and does not double-add", () => {
  store().savePlan(week("2027-01-04"));
  const planId = store().plans[0].id;
  store().addPlanObjective(planId, "Read the report");
  const o = store().plans[0].objectives![0];

  store().savePlanObjective(planId, { ...o, status: "completed" });
  const first = store().plans[0].objectives![0].completedAt;
  assert.ok(first);
  store().savePlanObjective(planId, { ...store().plans[0].objectives![0], title: "Read the whole report" });
  const after = store().plans[0].objectives!;
  assert.equal(after.length, 1, "edited, not added again");
  assert.equal(after[0].title, "Read the whole report");
  assert.equal(after[0].completedAt, first, "the original completion time is kept");
});

test("the objective limit is enforced without disturbing what is there", () => {
  store().savePlan(week("2027-01-04"));
  const planId = store().plans[0].id;
  for (let i = 0; i < LIMITS.objectives; i++) assert.ok(store().addPlanObjective(planId, `Objective ${i + 1}`));
  assert.equal(store().plans[0].objectives!.length, LIMITS.objectives);
  assert.equal(store().addPlanObjective(planId, "One more"), null);
  assert.equal(store().plans[0].objectives!.length, LIMITS.objectives);
});

/* ── working on it is not finishing it ─────────────────────────── */

test("a journal link records the day worked without completing the objective", () => {
  store().savePlan(week("2027-01-04"));
  const planId = store().plans[0].id;
  store().addPlanObjective(planId, "Read the report");
  const id = store().plans[0].objectives![0].id;

  store().setObjectiveJournalLink(planId, id, "2027-01-06", true);
  let o = store().plans[0].objectives![0];
  assert.deepEqual(o.journalDates, ["2027-01-06"]);
  assert.equal(o.status, "notStarted", "worked on it, not done");
  assert.equal(o.completedAt, undefined);

  store().setObjectiveJournalLink(planId, id, "2027-01-07", true);
  assert.deepEqual(store().plans[0].objectives![0].journalDates, ["2027-01-06", "2027-01-07"]);

  store().setObjectiveJournalLink(planId, id, "2027-01-06", false);
  o = store().plans[0].objectives![0];
  assert.deepEqual(o.journalDates, ["2027-01-07"]);
  assert.equal(o.status, "notStarted");
  assert.equal(withObjectiveJournalDate(o, "2027-01-07", false).journalDates, undefined, "last link removed cleanly");
});

/* ── the review reads the records ──────────────────────────────── */

test("the review sorts objectives, activities and milestones into completed, pending, deferred and carried", () => {
  const nextWeek = week("2027-01-11", {
    items: [{ ...act("Carried on"), status: "deferred" }],
  });
  const plan = week("2027-01-04", {
    objectives: [
      objective({ id: "oa", title: "Done objective", status: "completed", completedAt: T }),
      objective({ id: "ob", title: "Open objective" }),
      objective({ id: "oc", title: "Dropped objective", status: "deferred" }),
    ],
    items: [
      act("Done activity", { status: "completed" }),
      { ...blankItem("milestone", "Done milestone", T), status: "completed" },
      act("Open activity", { status: "inProgress" }),
      act("Carried activity", {
        status: "deferred",
        carriedTo: { planId: nextWeek.id, itemId: nextWeek.items![0].id },
      }),
    ],
  });

  const facts = planReviewFacts([plan, nextWeek], plan, "2027-01-12");
  assert.deepEqual(
    [facts.completed.map((e) => e.title), facts.pending.map((e) => e.title), facts.deferred.map((e) => e.title)],
    [
      ["Done objective", "Done activity", "Done milestone"],
      ["Open objective", "Open activity"],
      ["Dropped objective", "Carried activity"],
    ],
  );
  assert.deepEqual(facts.carried.map((e) => e.title), ["Carried activity"]);
  assert.equal(facts.objectives.completed, 1);
  assert.equal(facts.objectives.total, 3);
  assert.equal(facts.objectives.pct, 33);
  assert.equal(facts.activities.completed, 1);
  assert.equal(facts.activities.deferred, 1);
  assert.equal(facts.activities.carried, 1);
  assert.deepEqual(facts.milestones, { total: 1, done: 1 });
});

/* ── two devices ───────────────────────────────────────────────── */

test("two devices editing the same objective keep one record, and their journal days both survive", () => {
  const base = week("2027-01-04", { objectives: [objective({ journalDates: ["2027-01-05"] })] });
  const local: RoadmapPlan = {
    ...base,
    updatedAt: "2027-01-06T10:00:00.000Z",
    objectives: [objective({ journalDates: ["2027-01-05", "2027-01-06"] })],
  };
  const remote: RoadmapPlan = {
    ...base,
    updatedAt: "2027-01-06T11:00:00.000Z",
    objectives: [objective({ journalDates: ["2027-01-05", "2027-01-07"] })],
  };

  const { value } = merge3<{ plans: RoadmapPlan[] }>(
    { plans: [base] },
    { plans: [local] },
    { plans: [remote] },
  );
  assert.equal(value.plans[0].objectives!.length, 1, "one objective, not one per device");
  assert.deepEqual(value.plans[0].objectives![0].journalDates, ["2027-01-05", "2027-01-06", "2027-01-07"]);
});

test("the same legacy objective seen on two devices is one objective after merging", () => {
  const legacy = { id: "m1", level: "month", start: "2027-01-01", end: "2027-01-31", objectives: ["Economy"] };
  const device = normalizePlans([structuredClone(legacy)])[0];
  const other = normalizePlans([structuredClone(legacy)])[0];
  assert.deepEqual(device.objectives, other.objectives, "identical deterministic records");

  const { value } = merge3<{ plans: RoadmapPlan[] }>(
    { plans: [] },
    { plans: [device] },
    { plans: [other] },
  );
  assert.equal(value.plans.length, 1);
  assert.deepEqual(value.plans[0].objectives?.map((o) => o.title), ["Economy"]);
});
