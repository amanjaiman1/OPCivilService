import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { RevisionItem, Subject } from "@/lib/types";
import { MemoryStorage } from "./memory-storage";
import { setActiveAccount, setStorageBackend } from "@/lib/account/scope";
import { useChronicle, blankChronicleState } from "@/lib/store";
import {
  completeTopicInData,
  firstRevisionDue,
  isTopicCompleted,
  reopenTopicInData,
  revisionForTopic,
  topicCompletion,
} from "@/lib/topic-completion";
import { rollupSubject, type LinkageIndex } from "@/lib/subjects";

const TODAY = "2027-03-10";

const subject = (over: Partial<Subject> = {}): Subject => ({
  id: "polity",
  name: "Polity",
  paper: "GS2",
  topics: [
    { id: "t-fr", name: "Fundamental Rights", status: "learning", confidence: 40, revisionCount: 0 },
    { id: "t-dpsp", name: "Directive Principles", status: "untouched", confidence: 10, revisionCount: 0 },
  ],
  ...over,
});

const revision = (over: Partial<RevisionItem> = {}): RevisionItem => ({
  id: "r1",
  subjectId: "polity",
  topic: "Fundamental Rights",
  addedOn: "2027-03-01",
  nextDue: "2027-03-05",
  intervalDays: 3,
  repetitions: 1,
  confidence: 3,
  ...over,
});

const store = () => useChronicle.getState();

beforeEach(() => {
  setStorageBackend(new MemoryStorage() as unknown as Storage);
  setActiveAccount(null);
  useChronicle.setState(blankChronicleState());
});

test("completing validates both ids and a real date, and changes nothing otherwise", () => {
  const data = { subjects: [subject()], revisions: [] };
  for (const [s, t, d] of [
    ["nope", "t-fr", TODAY],
    ["polity", "nope", TODAY],
    ["polity", "t-fr", "10-03-2027"],
    ["", "", TODAY],
  ] as const) {
    const out = completeTopicInData(data, s, t, d);
    assert.equal(out.changed, false);
    assert.deepEqual(out.subjects, data.subjects);
    assert.deepEqual(out.revisions, []);
  }
});

test("completion records the day, reaches mastered, and queues one first revision", () => {
  const out = completeTopicInData({ subjects: [subject()], revisions: [] }, "polity", "t-fr", TODAY);
  assert.equal(out.changed, true);
  assert.equal(out.revisionAdded, true);
  const topic = out.subjects[0].topics.find((t) => t.id === "t-fr")!;
  assert.equal(topic.status, "mastered");
  assert.equal(topic.completedOn, TODAY);
  assert.equal(topic.confidence, 92, "completion guarantees the top rung's confidence");
  assert.equal(out.revisions.length, 1);
  assert.equal(out.revisions[0].topic, "Fundamental Rights");
  assert.equal(out.revisions[0].nextDue, firstRevisionDue(TODAY));

  const again = completeTopicInData(out, "polity", "t-fr", TODAY);
  assert.equal(again.changed, false, "idempotent");
  assert.equal(again.revisionAdded, false, "never a second copy");
  assert.equal(again.revisions.length, 1);
});

test("a completion can opt out of the revision queue but still completes", () => {
  const out = completeTopicInData({ subjects: [subject()], revisions: [] }, "polity", "t-fr", TODAY, { scheduleRevision: false });
  assert.equal(out.changed, true);
  assert.equal(out.revisionAdded, false);
  assert.equal(out.revisions.length, 0);
});

test("completing again fills a legacy completedOn without duplicating anything", () => {
  const legacy = subject({
    topics: [{ id: "t-fr", name: "Fundamental Rights", status: "mastered", confidence: 92, revisionCount: 2 }],
  });
  const out = completeTopicInData({ subjects: [legacy], revisions: [] }, "polity", "t-fr", TODAY);
  assert.equal(out.changed, true);
  assert.equal(out.subjects[0].topics[0].completedOn, TODAY);
  assert.equal(out.subjects[0].topics[0].revisionCount, 2, "history is untouched");
});

test("reopening clears the completion and removes only a never-used queue entry", () => {
  const fresh = revision({ lastRevised: undefined, repetitions: 0, passes: undefined });
  const used = revision({ id: "r2", lastRevised: "2027-03-04", repetitions: 2, passes: ["2027-03-04"] });
  const completed = subject({
    topics: [{ id: "t-fr", name: "Fundamental Rights", status: "mastered", confidence: 95, revisionCount: 4, completedOn: TODAY, lastTouched: TODAY }],
  });
  const reopened = reopenTopicInData({ subjects: [completed], revisions: [fresh, used] }, "polity", "t-fr", "2027-03-12");
  assert.equal(reopened.changed, true);
  const topic = reopened.subjects[0].topics[0];
  assert.equal(topic.status, "learning");
  assert.equal(topic.completedOn, undefined, "the completion day is gone");
  assert.equal(topic.confidence, 95, "confidence is not erased");
  assert.equal(topic.revisionCount, 4, "revision history is not erased");
  assert.deepEqual(reopened.revisions.map((r) => r.id), ["r2"], "only the unused entry goes");
});

test("a first revision is never due in the past", () => {
  assert.equal(firstRevisionDue("2027-03-01", TODAY), TODAY);
  assert.equal(firstRevisionDue(TODAY, TODAY), "2027-03-11");
});

test("the store has one completing path and the status picker goes through it", () => {
  useChronicle.setState({ subjects: [subject()] });
  const first = store().completeTopic("polity", "t-fr");
  assert.deepEqual(first, { changed: true, revisionAdded: true });
  assert.equal(store().subjects[0].topics[0].status, "mastered");
  assert.equal(store().revisions.length, 1);

  store().setTopicProgress("polity", "t-dpsp", "mastered");
  assert.equal(store().subjects[0].topics[1].status, "mastered");
  assert.ok(store().subjects[0].topics[1].completedOn, "the picker records the completion day too");
  assert.equal(store().revisions.length, 2);

  store().setTopicProgress("polity", "t-dpsp", "revised");
  assert.equal(store().subjects[0].topics[1].status, "revised");
  assert.equal(store().subjects[0].topics[1].completedOn, undefined, "stepping down reopens it");
  assert.equal(store().revisions.length, 1, "the unused queue entry is removed");
});

test("bulk completion uses the same completion and reopening rules", () => {
  useChronicle.setState({ subjects: [subject()] });
  store().setTopicsStatus("polity", ["t-fr", "t-dpsp"], "mastered");
  assert.equal(store().subjects[0].topics.every((t) => t.status === "mastered"), true);
  assert.equal(store().revisions.length, 2);
  store().setTopicsStatus("polity", ["t-fr"], "learning");
  assert.equal(store().subjects[0].topics[0].status, "learning");
  assert.equal(store().subjects[0].topics[0].completedOn, undefined);
});

test("a subject's completion reading is mastered over total, and revision lookup is by normalised name", () => {
  const rollup = rollupSubject(
    subject({ topics: [
      { id: "a", name: "A", status: "mastered", confidence: 92, revisionCount: 0 },
      { id: "b", name: "B", status: "revised", confidence: 68, revisionCount: 0 },
      { id: "c", name: "C", status: "untouched", confidence: 0, revisionCount: 0 },
      { id: "d", name: "D", status: "mastered", confidence: 80, revisionCount: 0 },
    ] }),
    0,
    { byTopic: new Map() } as LinkageIndex,
    TODAY,
  );
  assert.equal(rollup.completed, 2);
  assert.equal(rollup.completionPct, 50);
  assert.deepEqual(topicCompletion([{ status: "mastered" }, { status: "learning" }]), { completed: 1, total: 2, pct: 50 });
  assert.equal(isTopicCompleted({ status: "mastered" }), true);
  assert.equal(revisionForTopic([revision({ topic: "  fundamental   rights " })], "polity", "Fundamental Rights")?.id, "r1");
});
