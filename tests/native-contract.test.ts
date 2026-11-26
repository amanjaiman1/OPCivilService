import assert from "node:assert/strict";
import { test } from "node:test";
import { createChronicleStore, snapshotFromState, STORE_VERSION } from "@/lib/chronicle-store";
import { defaultSetup } from "@/lib/seed";
import { blankItem, blankPlan, weekStartOf } from "@/lib/roadmap";
import { weeklyGoalItems } from "@/lib/weekly-goal-items";
import { habitContext, todayHabits } from "@/lib/habit-engine";
import { SyncEngine, SyncError, type SyncBase, type SyncTransport } from "@/lib/sync/engine";
import { snapshotStoreAdapter } from "@/lib/sync/snapshot-store";
import { mergeStudyEntry } from "../apps/mobile/src/journal";
import { callbackCode } from "../apps/mobile/src/links";

function devices() {
  const entries = new Map<string, string>();
  const bases = new Map<string, SyncBase>();
  async function open(account: string) {
    const store = createChronicleStore({
      key: account,
      storage: {
        getItem: (key) => entries.get(key) ?? null,
        setItem: (key, value) => { entries.set(key, value); },
        removeItem: (key) => { entries.delete(key); },
      },
    });
    const pristine = !entries.has(account);
    await store.persist.rehydrate();
    assert.equal(store.lastHydrationFailed(), false);
    return {
      store, pristine, local: snapshotStoreAdapter(account, store),
      base: { load: async () => bases.get(account) ?? null, save: async (base: SyncBase) => { bases.set(account, base); } },
    };
  }
  return { open };
}

test("native callback matches the configured destination, and carries exactly one code", () => {
  const redirect = "doordie-dev://auth/callback";
  const code = "12345678-1234-1234-1234-123456789012";
  assert.equal(callbackCode(`${redirect}?code=${code}`, redirect), code);
  for (const input of [
    `https://auth/callback?code=${code}`, `doordie://auth/callback?code=${code}`,
    `doordie-dev://auth/delete?code=${code}`, `${redirect}?code=${code}&code=${code}`,
    `${redirect}#access_token=${code}`, `doordie-dev://someone@auth/callback?code=${code}`,
  ]) assert.equal(callbackCode(input, redirect), null, input);
});

test("shared store reopens offline records in the same account, then reconciles independent web edits", async () => {
  const date = "2026-11-26";
  const disk = devices();
  let mobile = await disk.open("account-a");
  const browser = await devices().open("account-a");
  browser.store.getState().completeOnboarding({ ...defaultSetup(), name: "Same account" });
  let cloud = { version: 5, data: browser.local.read(), updatedAt: null, schema: STORE_VERSION };
  let online = true;
  let writes = 0;
  const head = () => ({ version: cloud.version, updatedAt: null, schema: STORE_VERSION });
  const transport: SyncTransport = {
    async head() { if (!online) throw new SyncError("Offline", "network"); return head(); },
    async fetch() { if (!online) throw new SyncError("Offline", "network"); return cloud; },
    async save(data, version) {
      if (!online) throw new SyncError("Offline", "network");
      if (version !== cloud.version) return { status: "conflict", head: head() };
      cloud = { ...head(), version: version + 1, data };
      writes++;
      return { status: "saved", head: head() };
    },
    async init() { assert.fail("An established account must not be reinitialised"); },
    async confirmReplace() { assert.fail("A merge does not replace the cloud copy"); },
  };
  const engineFor = (d: Awaited<ReturnType<typeof disk.open>>) => new SyncEngine({
    schema: STORE_VERSION, pristine: d.pristine, baseStore: d.base, store: d.local, transport,
  });
  let engine = engineFor(mobile);
  assert.equal(await engine.start(), true);
  assert.equal(mobile.store.getState().profile.name, "Same account");
  online = false;
  const subject = mobile.store.getState().subjects.find((item) => item.topics.length)!;
  const topic = subject.topics[0];
  const entry = mergeStudyEntry({ date, today: date, subject, topicIds: [topic.id], id: "offline-entry", hours: "2", reflection: "", revisions: [] });
  mobile.store.getState().saveJournalEntry({ entry, scheduleRevision: true });
  const queued = mobile.store.getState().revisions.find((r) => r.topicId === topic.id);
  assert.ok(queued);
  engine.stop();

  mobile = await disk.open("account-a");
  assert.equal(mobile.store.getState().journal[0].totalHours, 2);
  assert.equal(mobile.local.readStamp(), 5);
  const other = await disk.open("account-b");
  assert.deepEqual(other.store.getState().journal, []);
  assert.equal(other.local.readStamp(), null);

  browser.store.getState().upsertGoal({ id: "web-goal", title: "Write an answer", horizon: "Weekly", status: "Active", createdOn: date });
  cloud = { ...cloud, version: 6, data: browser.local.read() };
  online = true;
  engine = engineFor(mobile);
  try {
    assert.equal(await engine.start(), true);
    assert.equal(await engine.sync(), true);
    assert.equal(writes, 1);
    assert.equal(mobile.store.getState().journal.length, 1);
    assert.equal(mobile.store.getState().goals[0].id, "web-goal");
    assert.deepEqual(cloud.data.journal, snapshotFromState(mobile.store.getState()).journal);
    assert.equal(mobile.store.getState().revisions.filter((r) => r.topicId === topic.id).length, 1);
  } finally { engine.stop(); }
});

test("native Capture reuses weekly Study goal and revision habit behavior", async () => {
  const { store } = await devices().open("account");
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  store.getState().completeOnboarding({ ...defaultSetup(today), name: "Student" });
  const target = blankItem("objective", "Read polity");
  const plan = { ...blankPlan("week", { start: weekStartOf(date) }), items: [target] };
  assert.ok(store.getState().savePlan(plan));
  assert.deepEqual(store.getState().goals, []);
  const subject = store.getState().subjects.find((item) => item.topics.length)!;
  store.getState().saveJournalEntry({
    entry: mergeStudyEntry({ date, today: date, subject, topicIds: [subject.topics[0].id], id: "day", hours: "1", reflection: "", revisions: [] }),
    scheduleRevision: true,
    weeklyTargets: [{ planId: plan.id, itemId: target.id, expectedStatus: "notStarted", complete: true }],
  });
  const revision = store.getState().revisions.find((item) => item.topicId === subject.topics[0].id)!;
  store.getState().reviseItem(revision.id, true);
  const state = store.getState();
  const row = weeklyGoalItems(state.plans, date).find((item) => item.item.id === target.id);
  assert.equal(row?.item.status, "completed");
  assert.equal(state.goals.length, 0);
  assert.equal(todayHabits(state.habits, habitContext(state, date)).find((item) => item.habit.name.toLowerCase().includes("revis"))?.done, true);
});

test("adding a topic to Capture leaves a previously saved record untouched until save", () => {
  const date = "2026-11-26";
  const subject = { id: "history", name: "History", paper: "GS1" as const,
    topics: [{ id: "medieval", name: "Medieval", confidence: 5, status: "untouched" as const, revisionCount: 0 }] };
  const previous = mergeStudyEntry({ date, today: date, subject, topicIds: [], id: "day", hours: "1", reflection: "", revisions: [] });
  const next = mergeStudyEntry({ date, today: date, previous, subject, topicIds: ["medieval"], id: "day", hours: "", reflection: "", revisions: [] });
  assert.equal(previous.completedTopics?.length, 0);
  assert.equal(next.completedTopics?.length, 1);
  assert.equal(next.totalHours, 1);
});

test("native notification taps must match this installation and use an allowed route", async () => {
  const { notificationRoute, noticeRoute } = await import("../apps/mobile/src/push-routing");
  const tap = "expo.modules.notifications.actions.DEFAULT";
  assert.deepEqual(noticeRoute("/journal?new=1"), { pathname: "/capture" });
  assert.equal(noticeRoute("https://example.invalid/revision"), null);
  assert.equal(noticeRoute("/module/../../account/delete"), null);
  assert.equal(notificationRoute({ device: "other", route: "/wellbeing", bedtime: true }, "mine", "sleep-now"), null);
  assert.equal(notificationRoute({ device: "mine", route: "/wellbeing", bedtime: true }, "mine", "later"), null);
  assert.equal(notificationRoute({ device: "mine", route: "/revision" }, "mine", "sleep-now"), null);
  assert.deepEqual(notificationRoute({ device: "mine", route: "/revision" }, "mine", tap),
    { pathname: "/module/[name]", params: { name: "revision" } });
});

test("Expo lock-screen data excludes account IDs, study titles and action credentials", async () => {
  const { expoMessage } = await import("@/lib/native-push");
  const delivery = expoMessage({ device_id: "current-device", user_id: "private-account", token: "synthetic", platform: "ios", timezone: "UTC" },
    { title: "private topic", body: "private note", tag: "private-tag", href: "/revision?topic=private-id", bedtimeToken: "private-capability" }, false);
  assert.deepEqual(delivery.data, { device: "current-device", route: "/revision", bedtime: false });
  assert.equal(JSON.stringify(delivery).includes("private"), false);
});

test("switching accounts during disk hydration stops the old sync before it subscribes", async () => {
  const disk = devices();
  const device = await disk.open("old-account");
  let release!: (base: SyncBase | null) => void;
  const ready = new Promise<SyncBase | null>((resolve) => { release = resolve; });
  const unreachable = async () => assert.fail("The previous account must not reach the cloud");
  const engine = new SyncEngine({
    schema: STORE_VERSION, pristine: true,
    baseStore: { load: () => ready, save: unreachable },
    store: { ...device.local, subscribe: () => assert.fail("Old account store was subscribed") },
    transport: { head: unreachable, fetch: unreachable, save: unreachable, init: unreachable, confirmReplace: unreachable },
  });
  const opening = engine.start();
  engine.stop();
  release(null);
  assert.equal(await opening, false);
});

test("native backup import keeps existing values, preserves independent rows and rejects another account", async () => {
  const { parseBackup } = await import("../apps/mobile/src/backup-data");
  const { store } = await devices().open("backup-account");
  store.getState().completeOnboarding({ ...defaultSetup(), name: "Current" });
  store.getState().upsertGoal({ id: "keep", title: "Current title", horizon: "Weekly", status: "Active", createdOn: "2026-11-25" });
  const current = snapshotFromState(store.getState());
  const entry = { id: "saved", title: "History", horizon: "Weekly", status: "Active", createdOn: "2026-11-26" };
  const backup = { app: "the-upsc-chronicle", schemaVersion: STORE_VERSION, account: { id: "backup-account" },
    data: { goals: [{ ...current.goals[0], title: "Old title" }, entry] } };
  const merged = parseBackup(backup, "backup-account", current);
  assert.equal(merged.goals?.find((goal) => goal.id === "keep")?.title, "Current title");
  assert.ok(merged.goals?.some((goal) => goal.id === "saved"));
  assert.throws(() => parseBackup(backup, "someone-else", current));
  assert.throws(() => parseBackup({ ...backup, data: { goals: [false] } }, "backup-account", current));
});

test("the Expo bedtime payload carries a separate installation action and omits the web credential", async () => {
  const { expoMessage } = await import("@/lib/native-push");
  const delivery = expoMessage({ device_id: "device", user_id: "private", token: "synthetic", platform: "android", timezone: "UTC" },
    { title: "private", body: "private", tag: "private", href: "/wellbeing", bedtimeToken: "web-capability" }, true,
    { night: "2026-11-26", token: "native-action" });
  assert.deepEqual(delivery.data, { device: "device", route: "/wellbeing", bedtime: true, night: "2026-11-26", action: "native-action" });
  assert.equal(JSON.stringify(delivery).includes("web-capability"), false);
});
