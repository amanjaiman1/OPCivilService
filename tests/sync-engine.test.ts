import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SyncEngine,
  SyncError,
  type BaseStore,
  type InitIntent,
  type LocalStoreAdapter,
  type RemoteHead,
  type Snapshot,
  type SyncBase,
  type SyncTransport,
} from "@/lib/sync/engine";
import type { MergeConflict } from "@/lib/sync/merge";
import { assessLocalCopy, destructiveSummary, isBlankSnapshot, type LossSummary } from "@/lib/sync/integrity";

/* ── a fake cloud with the same rules as the database functions ──────────
   chronicle_save (compare-and-swap, destructive guard, schema guard),
   chronicle_init (first snapshot at most once, decided by the server) and
   chronicle_confirm_replace. See supabase/tests/sync_safety.sql for the
   same rules proven in Postgres. */

const SCHEMA = 17;

class FakeCloud {
  row: { data: Snapshot; version: number; updatedAt: string; schema: number } | null = null;
  /** The ledger: this account has had a cloud copy before. */
  initialised = false;
  accountAgeDays = 0;
  online = true;
  fetches = 0;
  /** Version checks, the cheap "has anything changed?" call. */
  heads = 0;
  /** Writes that changed the row. */
  writes = 0;
  inits: InitIntent[] = [];
  history: Snapshot[] = [];
  private holds = new Map<string, { base: number; payload: string }>();
  private clock = Date.parse("2026-11-15T10:00:00Z");

  /** An account that already has a month of data in the cloud. */
  seed(data: Snapshot, version = 10, schema = SCHEMA) {
    this.row = { data: structuredClone(data), version, updatedAt: this.stamp(), schema };
    this.initialised = true;
  }
  private stamp() {
    return new Date((this.clock += 1000)).toISOString();
  }
  private head(): RemoteHead {
    return this.row
      ? { version: this.row.version, updatedAt: this.row.updatedAt, schema: this.row.schema }
      : { version: 0, updatedAt: null };
  }
  private check() {
    if (!this.online) throw new SyncError("offline", "network");
  }
  private write(data: Snapshot, schema: number) {
    const version = (this.row?.version ?? 0) + 1;
    this.row = {
      data: structuredClone(data),
      version,
      updatedAt: this.stamp(),
      schema: Math.max(this.row?.schema ?? 0, schema),
    };
    this.initialised = true;
    this.writes++;
  }
  transport(schema = SCHEMA): SyncTransport {
    return {
      head: async () => {
        this.check();
        this.heads++;
        return this.row ? this.head() : null;
      },
      fetch: async () => {
        this.check();
        this.fetches++;
        return this.row ? { data: structuredClone(this.row.data), ...this.head() } : null;
      },
      save: async (data, base) => {
        this.check();
        if (!this.row) return { status: "missing" };
        if (schema < this.row.schema) return { status: "outdated", head: this.head() };
        if (this.row.version !== base) return { status: "conflict", head: this.head() };
        const summary = destructiveSummary(this.row.data, data);
        if (summary) {
          const id = `hold-${this.holds.size + 1}`;
          this.holds.set(id, { base, payload: JSON.stringify(data) });
          return { status: "held", head: this.head(), hold: { id, summary } };
        }
        this.write(data, schema);
        return { status: "saved", head: this.head() };
      },
      init: async (data, intent) => {
        this.check();
        this.inits.push(intent);
        if (this.row) return { status: "exists", head: this.head() };
        const blank = isBlankSnapshot(data);
        const allowed = this.initialised
          ? intent === "fresh" || (intent === "device" && !blank)
          : intent === "fresh" || !blank || this.accountAgeDays <= 7;
        if (!allowed) return { status: "needs_recovery", reason: this.initialised ? "missing" : "unrecognised" };
        this.row = null;
        this.write(data, schema);
        return { status: "created", head: this.head() };
      },
      confirmReplace: async (id, data) => {
        this.check();
        const hold = this.holds.get(id);
        this.holds.delete(id);
        if (!hold || hold.payload !== JSON.stringify(data)) return { status: "expired" };
        if (!this.row) return { status: "missing" };
        if (this.row.version !== hold.base) return { status: "conflict", head: this.head() };
        this.history.push(structuredClone(this.row.data));
        this.write(data, schema);
        return { status: "saved", head: this.head() };
      },
    };
  }
}

/* ── a fake device: a store with its stamp, plus the synced copy, as the
   browser persists them (localStorage and IndexedDB), surviving restarts ── */

class Device {
  state: Snapshot;
  stamp: number | null = null;
  base: SyncBase | null = null;
  conflicts: MergeConflict[] = [];
  removals: { summary: LossSummary; before: Snapshot }[] = [];
  /** This browser has completed a sync (the `ready` key). */
  ready = false;
  engine!: SyncEngine;
  private listeners = new Set<() => void>();

  constructor(
    private cloud: FakeCloud,
    initial: Snapshot,
    private opts: { legacy?: { syncedAt: string | null }; schema?: number; transport?: SyncTransport } = {},
  ) {
    this.state = structuredClone(initial);
    this.boot();
  }

  /** What `activateAccount` decides, with the same function. */
  private boot() {
    const trust = assessLocalCopy({
      cloud: true,
      stampOk: this.stamp != null,
      hasStamp: this.stamp != null,
      blank: isBlankSnapshot(this.state),
      legacy: Boolean(this.opts.legacy),
      ready: this.ready,
      hadStore: true,
      quarantined: false,
    });
    this.verified = trust.verified;
    const store: LocalStoreAdapter = {
      read: () => this.state,
      readStamp: () => this.stamp,
      apply: (next, stamp) => {
        if (next) this.state = structuredClone(next);
        this.stamp = stamp;
        if (next) this.listeners.forEach((l) => l());
      },
      subscribe: (fn) => {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
      },
    };
    const baseStore: BaseStore = {
      load: async () => structuredClone(this.base),
      save: async (b) => {
        this.base = structuredClone(b);
      },
    };
    this.engine = new SyncEngine({
      transport: this.opts.transport ?? this.cloud.transport(this.opts.schema ?? SCHEMA),
      store,
      baseStore,
      pristine: trust.pristine,
      trustUnstampedBase: trust.trustUnstampedBase,
      schema: this.opts.schema ?? SCHEMA,
      legacy: this.opts.legacy,
      debounceMs: 60_000, // tests drive syncs explicitly
      onConflicts: (c) => this.conflicts.push(...c),
      onRemoteRemoval: (summary, before) => this.removals.push({ summary, before: structuredClone(before) }),
      onState: (s) => {
        if (s.lastSyncedAt) this.ready = true;
      },
    });
  }
  verified = false;

  /** Closing the app and opening it again: what was persisted is all that's left. */
  restart() {
    this.engine.stop();
    this.listeners.clear();
    this.boot();
  }

  /** The browser's localStorage is cleared (the store, its stamp, the ready key); IndexedDB survives. */
  wipeLocalStorage(blank: Snapshot) {
    this.engine.stop();
    this.state = structuredClone(blank);
    this.stamp = null;
    this.ready = false;
    this.listeners.clear();
    this.boot();
  }

  edit(fn: (s: Snapshot) => void) {
    const next = structuredClone(this.state);
    fn(next);
    this.state = next;
    this.listeners.forEach((l) => l());
  }
}

type Day = { date: string; totalHours: number };
const days = (s: Snapshot) => ((s.journal as Day[]) ?? []).map((d) => d.date).sort();
const template = (): Snapshot => ({ profile: { name: "Asha", dailyHourTarget: 8 }, journal: [], habits: [] });
/** What a fresh browser holds before anything loads: setup not done, three suggested habits. */
const blankAccount = (): Snapshot => ({
  profile: { name: "", dailyHourTarget: 8 },
  journal: [],
  lifeLog: [],
  habits: [{ id: "study" }, { id: "news" }, { id: "revise" }],
  revisions: [],
  themeMode: "light",
});
/** A month of preparation, set up in June. */
const month = (): Snapshot => ({
  profile: { name: "Asha", dailyHourTarget: 8, onboardedAt: "2026-06-12" },
  journal: Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, totalHours: 6 })),
  lifeLog: Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, mood: 4 })),
  habits: [{ id: "study" }, { id: "news" }, { id: "revise" }, { id: "run" }],
  revisions: Array.from({ length: 12 }, (_, i) => ({ id: `r${i}` })),
  themeMode: "dark",
});

/* ── the incident ────────────────────────────────────────────────── */

test("INCIDENT: a wiped store next to a surviving synced copy never uploads the blank", async () => {
  const cloud = new FakeCloud();
  cloud.seed(month(), 200);
  const brave = new Device(cloud, blankAccount());
  await brave.engine.start();
  assert.equal(days(brave.state).length, 30, "the device downloaded the month");
  assert.equal(cloud.writes, 0);

  // Site storage removed, but the IndexedDB copy of the last sync survives.
  brave.wipeLocalStorage(blankAccount());
  assert.equal(brave.base?.version, 200, "the synced copy survived");
  assert.equal(brave.verified, false, "a wiped copy is not verified: it must wait for the cloud");
  await brave.engine.start();

  assert.equal(cloud.writes, 0, "nothing was written to the cloud");
  assert.equal(cloud.row!.version, 200);
  assert.equal(days(cloud.row!.data).length, 30, "the cloud still has the month");
  assert.equal(days(brave.state).length, 30, "the device has it back");
  assert.equal(brave.state.themeMode, "dark", "and the student's theme, not the default");
  assert.equal(brave.stamp, 200);
  brave.engine.stop();
});

test("INCIDENT, defence in depth: even a verified device can't replace the month with a blank", async () => {
  const cloud = new FakeCloud();
  cloud.seed(month(), 200);
  const device = new Device(cloud, blankAccount());
  await device.engine.start();
  // Something on the device empties the store while its stamp still says 200.
  device.edit((s) => Object.assign(s, blankAccount()));
  await device.engine.sync();
  assert.equal(device.engine.getState().status, "held", "the server held the save");
  assert.equal(cloud.row!.version, 200, "and changed nothing");
  assert.equal(days(cloud.row!.data).length, 30);
  assert.equal(device.engine.getState().hold?.summary.lists.journal?.[0], 30);

  // While held, nothing else is pushed.
  device.edit((s) => (s.journal as Day[]).push({ date: "2026-11-21", totalHours: 2 }));
  assert.equal(await device.engine.sync(), false);
  assert.equal(cloud.writes, 0);

  // "Bring my data back": the month returns, the new day stays.
  await device.engine.resolveHold("restore");
  assert.equal(device.engine.getState().status, "synced");
  assert.equal(days(device.state).length, 31);
  assert.equal(days(cloud.row!.data).length, 31, "the cloud gained the new day and lost nothing");
  assert.equal((cloud.row!.data.profile as { onboardedAt?: string }).onboardedAt, "2026-06-12");
  device.engine.stop();
});

/* ── critical tests A–D, F–H ─────────────────────────────────────── */

test("A: an existing account on a new browser hydrates from the cloud and writes nothing", async () => {
  const cloud = new FakeCloud();
  cloud.seed(month(), 42);
  const fresh = new Device(cloud, blankAccount());
  assert.equal(fresh.verified, false, "a new browser waits for the cloud");
  assert.ok(await fresh.engine.start());
  assert.deepEqual(fresh.state, cloud.row!.data, "it holds exactly the cloud copy");
  assert.equal(cloud.writes, 0);
  assert.deepEqual(cloud.inits, [], "and never asked to create an account");
  fresh.engine.stop();
});

test("B/C: with the cloud unreachable, a new browser creates nothing; on retry it loads the original", async () => {
  const cloud = new FakeCloud();
  cloud.seed(month(), 42);
  cloud.online = false;
  const fresh = new Device(cloud, blankAccount());
  assert.equal(await fresh.engine.start(), false);
  assert.equal(fresh.engine.getState().status, "offline");
  assert.equal(fresh.ready, false, "it never became ready, so the app keeps editing closed");
  assert.equal(cloud.writes, 0);
  assert.deepEqual(cloud.inits, [], "a failed request is not an empty account");

  cloud.online = true;
  assert.ok(await fresh.engine.retry());
  assert.deepEqual(fresh.state, cloud.row!.data);
  assert.equal(cloud.row!.version, 42, "the original snapshot is untouched");
  fresh.engine.stop();
});

test("D: a verified device edits offline, survives a restart, and syncs without duplicates", async () => {
  const cloud = new FakeCloud();
  cloud.seed(month(), 5);
  const phone = new Device(cloud, blankAccount());
  await phone.engine.start();
  assert.equal(phone.stamp, 5);

  cloud.online = false;
  phone.edit((s) => {
    (s.journal as Day[])[0].totalHours = 9; // update a journal entry
    (s.habits as { id: string; log?: Record<string, boolean> }[])[0].log = { "2026-11-20": true }; // record a habit
    (s.revisions as { id: string }[]).push({ id: "r-new" }); // a revision entry
  });
  assert.equal(await phone.engine.sync(), false);
  assert.equal(phone.engine.getState().status, "offline");
  assert.equal(phone.engine.getState().pending, true);

  phone.restart();
  assert.equal(phone.verified, true, "after a restart the stamped copy opens offline");
  assert.equal(await phone.engine.start(), false, "still offline");
  assert.equal((phone.state.journal as Day[])[0].totalHours, 9, "the edits survived the restart");

  cloud.online = true;
  assert.ok(await phone.engine.sync());
  assert.equal(phone.engine.getState().pending, false);
  assert.equal((cloud.row!.data.journal as Day[])[0].totalHours, 9);
  assert.equal((cloud.row!.data.revisions as unknown[]).length, 13, "one revision added, none duplicated");
  assert.equal(cloud.writes, 1);
  phone.engine.stop();
});

test("F: a device left behind at an old version can't overwrite the newer one", async () => {
  const cloud = new FakeCloud();
  cloud.seed(month(), 10);
  const a = new Device(cloud, blankAccount());
  await a.engine.start();
  const b = new Device(cloud, blankAccount());
  await b.engine.start();

  b.edit((s) => (s.goals = [{ id: "g-b", title: "B's goal" }]));
  await b.engine.sync();
  assert.equal(cloud.row!.version, 11);

  // A still believes it is at 10 and has its own edit.
  a.edit((s) => ((s.profile as { dailyHourTarget: number }).dailyHourTarget = 10));
  await a.engine.sync();
  assert.equal((cloud.row!.data.goals as { id: string }[])[0]?.id, "g-b", "B's change survived");
  assert.equal((cloud.row!.data.profile as { dailyHourTarget: number }).dailyHourTarget, 10, "and A's merged in");
  assert.equal(days(cloud.row!.data).length, 30);
  a.engine.stop();
  b.engine.stop();
});

test("G: another tab's stale save never turns the cloud's additions into deletions", async () => {
  const cloud = new FakeCloud();
  cloud.seed(month(), 3);
  const leader = new Device(cloud, blankAccount());
  await leader.engine.start();
  const staleTab = structuredClone(leader.state);
  const staleStamp = leader.stamp;

  // Another device adds a day; the leader pulls it.
  const other = new Device(cloud, blankAccount());
  await other.engine.start();
  other.edit((s) => (s.journal as Day[]).push({ date: "2026-11-22", totalHours: 3 }));
  await other.engine.sync();
  await leader.engine.sync();
  assert.ok(days(leader.state).includes("2026-11-22"));

  // A second tab, which hadn't heard yet, saves its copy (with its older stamp)
  // plus an edit, and the leader picks that up from storage.
  staleTab.goals = [{ id: "g-tab", title: "From the other tab" }];
  leader.state = staleTab;
  leader.stamp = staleStamp;
  await leader.engine.sync();

  assert.ok(days(cloud.row!.data).includes("2026-11-22"), "the other device's day is still in the cloud");
  assert.equal((cloud.row!.data.goals as { id: string }[])[0]?.id, "g-tab", "and the tab's edit arrived");
  leader.engine.stop();
  other.engine.stop();
});

test("G: two devices editing at once lose nothing and duplicate nothing", async () => {
  const cloud = new FakeCloud();
  const laptop = new Device(cloud, template());
  await laptop.engine.start();
  const phone = new Device(cloud, template());
  await phone.engine.start();

  cloud.online = false;
  laptop.edit((s) => (s.journal as Day[]).push({ date: "2026-11-10", totalHours: 6 }));
  phone.edit((s) => (s.journal as Day[]).push({ date: "2026-11-11", totalHours: 7 }));
  phone.edit((s) => (s.journal as Day[]).push({ date: "2026-11-10", totalHours: 6 }));
  phone.edit((s) => ((s.profile as { name: string }).name = "Asha R."));
  assert.equal(await laptop.engine.sync(), false);

  cloud.online = true;
  assert.ok(await laptop.engine.sync());
  assert.ok(await phone.engine.sync()); // refused once, merges, saves
  assert.ok(await laptop.engine.sync()); // picks up the phone's merge

  assert.deepEqual(days(cloud.row!.data), ["2026-11-10", "2026-11-11"], "the same day logged twice is one day");
  assert.equal((cloud.row!.data.profile as { name: string }).name, "Asha R.");
  assert.deepEqual(laptop.state, phone.state, "both devices end up identical");
  laptop.engine.stop();
  phone.engine.stop();
});

test("H: a stamp from another account's copy is not trusted", () => {
  // The store adapter only reports a stamp that names this account (see
  // store-adapter.ts); activation then treats the copy as unverified.
  const trust = assessLocalCopy({
    cloud: true,
    stampOk: false,
    hasStamp: true,
    blank: false,
    legacy: false,
    ready: true,
    hadStore: true,
    quarantined: true,
  });
  assert.equal(trust.verified, false);
  assert.equal(trust.trustUnstampedBase, false);
});

/* ── the first snapshot, and recovery ─────────────────────────────── */

test("a new account's first device creates the cloud copy; a second device adopts it", async () => {
  const cloud = new FakeCloud();
  const laptop = new Device(cloud, template());
  await laptop.engine.start();
  assert.equal(cloud.row?.version, 1);
  assert.deepEqual(cloud.inits, ["auto"]);

  const phone = new Device(cloud, { profile: { name: "", dailyHourTarget: 8 }, journal: [], habits: [] });
  await phone.engine.start();
  assert.deepEqual(phone.state, cloud.row?.data, "the pristine phone takes the cloud copy");
  assert.equal(cloud.row?.version, 1, "and writes nothing back");
  laptop.engine.stop();
  phone.engine.stop();
});

test("an old account with no cloud copy goes to recovery, never to a silent new account", async () => {
  const cloud = new FakeCloud();
  cloud.accountAgeDays = 160;
  const fresh = new Device(cloud, blankAccount());
  assert.equal(await fresh.engine.start(), false);
  assert.equal(fresh.engine.getState().status, "recovery");
  assert.equal(fresh.engine.getState().recovery, "unrecognised");
  assert.ok(cloud.row === null, "no snapshot was created");

  // Automatic checks don't keep asking; "Try again" does.
  await fresh.engine.checkRemote();
  assert.deepEqual(cloud.inits, ["auto"]);
  await fresh.engine.retry();
  assert.deepEqual(cloud.inits, ["auto", "auto"]);
  assert.ok(cloud.row === null);

  // Only the student's explicit choice starts an empty account.
  await fresh.engine.initialise("fresh");
  assert.equal(fresh.engine.getState().status, "synced");
  assert.equal((cloud.row as FakeCloud["row"])?.version, 1);
  fresh.engine.stop();
});

test("an old account whose only copy is on this device uploads it", async () => {
  const cloud = new FakeCloud();
  cloud.accountAgeDays = 160;
  const original = new Device(cloud, month());
  await original.engine.start();
  assert.equal(cloud.row?.version, 1, "the device's own data may create the first snapshot");
  assert.equal(days(cloud.row!.data).length, 30);
  original.engine.stop();
});

test("a missing row on an initialised account is recovery: nothing is created until the student chooses", async () => {
  const cloud = new FakeCloud();
  cloud.seed(month(), 8);
  const device = new Device(cloud, blankAccount());
  await device.engine.start();
  cloud.row = null; // removed behind the app's back

  device.edit((s) => (s.journal as Day[]).push({ date: "2026-11-23", totalHours: 1 }));
  await device.engine.sync();
  assert.equal(device.engine.getState().status, "recovery");
  assert.equal(device.engine.getState().recovery, "missing");
  assert.ok(cloud.row === null);

  await device.engine.initialise("device");
  assert.equal(device.engine.getState().status, "synced");
  assert.equal(days(cloud.row!.data).length, 31, "this device's copy became the cloud copy again");
  device.engine.stop();
});

/* ── explicit destructive changes, schema, removals from elsewhere ── */

test("a deliberate mass deletion is applied only once confirmed, and the old copy is kept", async () => {
  const cloud = new FakeCloud();
  cloud.seed(month(), 4);
  const device = new Device(cloud, blankAccount());
  await device.engine.start();
  device.edit((s) => (s.lifeLog = []));
  await device.engine.sync();
  assert.equal(device.engine.getState().status, "held");
  await device.engine.resolveHold("confirm");
  assert.equal(device.engine.getState().status, "synced");
  assert.equal((cloud.row!.data.lifeLog as unknown[]).length, 0);
  assert.equal((cloud.history[0].lifeLog as unknown[]).length, 30, "the server kept a copy first");
  device.engine.stop();
});

test("an app older than the one that last saved the account writes nothing", async () => {
  const cloud = new FakeCloud();
  cloud.seed(month(), 6, 18);
  const old = new Device(cloud, blankAccount(), { schema: SCHEMA });
  await old.engine.start();
  assert.equal(old.engine.getState().status, "outdated");
  assert.equal(cloud.writes, 0);
  old.edit((s) => (s.journal = []));
  assert.equal(await old.engine.sync(), false);
  assert.equal(await old.engine.flush(), false);
  assert.equal(cloud.writes, 0);
  old.engine.stop();
});

test("a removal arriving from the cloud keeps a copy of what this device had", async () => {
  const cloud = new FakeCloud();
  cloud.seed(month(), 2);
  const keeper = new Device(cloud, blankAccount());
  await keeper.engine.start();
  // Elsewhere, the student confirmed clearing the Life Dashboard.
  const elsewhere = new Device(cloud, blankAccount());
  await elsewhere.engine.start();
  elsewhere.edit((s) => (s.lifeLog = []));
  await elsewhere.engine.sync();
  await elsewhere.engine.resolveHold("confirm");

  await keeper.engine.sync();
  assert.equal((keeper.state.lifeLog as unknown[]).length, 0, "the confirmed change is applied");
  assert.equal(keeper.removals.length, 1, "after keeping a copy");
  assert.equal((keeper.removals[0].before.lifeLog as unknown[]).length, 30);
  keeper.engine.stop();
  elsewhere.engine.stop();
});

/* ── carried over: merging, legacy data, live updates ────────────── */

test("a device with no local edits never overwrites newer cloud data", async () => {
  const cloud = new FakeCloud();
  const laptop = new Device(cloud, template());
  await laptop.engine.start();
  const stale = new Device(cloud, template());
  await stale.engine.start();

  laptop.edit((s) => (s.journal as Day[]).push({ date: "2026-11-12", totalHours: 5 }));
  await laptop.engine.sync();
  const before = structuredClone(cloud.row);

  await stale.engine.sync(); // was behind; should only fast-forward
  assert.deepEqual(cloud.row, before, "the stale device wrote nothing");
  assert.deepEqual(days(stale.state), ["2026-11-12"]);
  laptop.engine.stop();
  stale.engine.stop();
});

test("the same field changed on both devices: this device wins, the other value is recorded", async () => {
  const cloud = new FakeCloud();
  const a = new Device(cloud, template());
  await a.engine.start();
  const b = new Device(cloud, template());
  await b.engine.start();

  a.edit((s) => ((s.profile as { dailyHourTarget: number }).dailyHourTarget = 9));
  b.edit((s) => ((s.profile as { dailyHourTarget: number }).dailyHourTarget = 10));
  await a.engine.sync();
  await b.engine.sync();

  assert.equal((cloud.row!.data.profile as { dailyHourTarget: number }).dailyHourTarget, 10);
  assert.deepEqual(b.conflicts, [{ path: "profile.dailyHourTarget", kept: 10, discarded: 9 }]);
  a.engine.stop();
  b.engine.stop();
});

test("pre-account data: local wins when the cloud hasn't changed since this browser last synced", async () => {
  const cloud = new FakeCloud();
  cloud.row = { data: { ...template(), journal: [{ date: "2026-11-01", totalHours: 4 }] }, version: 1, updatedAt: "2026-11-14T08:00:00.000Z", schema: 0 };
  cloud.initialised = true;
  const local = { ...template(), journal: [{ date: "2026-11-01", totalHours: 4 }, { date: "2026-11-14", totalHours: 9 }] };
  const owner = new Device(cloud, local, { legacy: { syncedAt: "2026-11-14T08:00:00.000Z" } });
  await owner.engine.start();
  assert.deepEqual(days(cloud.row!.data), ["2026-11-01", "2026-11-14"], "the unsynced day reached the cloud");
  owner.engine.stop();
});

test("pre-account data: when the cloud moved on, both sides' days are kept", async () => {
  const cloud = new FakeCloud();
  cloud.row = {
    data: { ...template(), journal: [{ date: "2026-11-01", totalHours: 4 }, { date: "2026-11-13", totalHours: 6 }] },
    version: 3,
    updatedAt: "2026-11-14T09:00:00.000Z",
    schema: 0,
  };
  cloud.initialised = true;
  const local = { ...template(), journal: [{ date: "2026-11-01", totalHours: 4 }, { date: "2026-11-12", totalHours: 8 }] };
  const owner = new Device(cloud, local, { legacy: { syncedAt: "2026-11-10T08:00:00.000Z" } });
  await owner.engine.start();
  assert.deepEqual(days(cloud.row!.data), ["2026-11-01", "2026-11-12", "2026-11-13"]);
  owner.engine.stop();
});

test("a device from before stamps, storage intact, keeps working offline and its offline edits", async () => {
  const cloud = new FakeCloud();
  cloud.seed(month(), 7);
  const old = new Device(cloud, blankAccount());
  await old.engine.start();
  // As the previous app version left it: a synced copy, a ready flag, no stamp.
  old.stamp = null;
  old.edit((s) => (s.goals = [{ id: "g-offline" }]));
  old.restart();
  assert.equal(old.verified, true, "an intact device still opens at once");
  await old.engine.start();
  assert.equal(old.stamp, 8, "it was stamped from its synced copy and saved its edit");
  assert.equal((cloud.row!.data.goals as { id: string }[])[0]?.id, "g-offline");
  old.engine.stop();
});

test("a stopped engine never applies a late response to the store", async () => {
  const cloud = new FakeCloud();
  cloud.seed({ ...template(), journal: [{ date: "2026-11-05", totalHours: 3 }] }, 2);
  let release: () => void = () => {};
  const slow = cloud.transport();
  const gated: SyncTransport = {
    ...slow,
    fetch: () => new Promise((resolve) => (release = () => resolve(slow.fetch()))),
  };
  const device = new Device(cloud, template(), { transport: gated });
  const started = device.engine.start();
  await new Promise((r) => setTimeout(r, 10));
  device.engine.stop(); // e.g. the account was switched
  release();
  await started;
  assert.deepEqual(device.state, template(), "nothing from the old session landed");
});

test("a live update about another device's save pulls it; one about this device's own save asks nothing", async () => {
  const cloud = new FakeCloud();
  const laptop = new Device(cloud, template());
  await laptop.engine.start();
  const phone = new Device(cloud, template());
  await phone.engine.start();

  phone.edit((s) => {
    (s.journal as Day[]).push({ date: "2026-11-16", totalHours: 6 });
  });
  await phone.engine.sync();
  const version = cloud.row!.version;
  await laptop.engine.checkRemote({ version });
  assert.deepEqual(days(laptop.state), ["2026-11-16"], "the laptop has the phone's day");

  const asked = { heads: cloud.heads, fetches: cloud.fetches };
  await phone.engine.checkRemote({ version });
  assert.deepEqual({ heads: cloud.heads, fetches: cloud.fetches }, asked, "nothing asked for its own save");
  await phone.engine.checkRemote();
  assert.equal(cloud.heads, asked.heads + 1, "a plain check asks for the version");
  laptop.engine.stop();
  phone.engine.stop();
});

test("a live update that arrives during a sync is checked once the sync is done", async () => {
  const cloud = new FakeCloud();
  const laptop = new Device(cloud, template());
  await laptop.engine.start();
  const phone = new Device(cloud, template());
  await phone.engine.start();

  laptop.edit((s) => {
    (s.habits as unknown[]).push({ id: "h1", name: "Newspaper" });
  });
  const running = laptop.engine.sync();
  phone.edit((s) => {
    (s.journal as Day[]).push({ date: "2026-11-17", totalHours: 4 });
  });
  await phone.engine.sync();
  void laptop.engine.checkRemote({ version: cloud.row!.version });
  await running;
  for (let i = 0; i < 20 && !days(laptop.state).includes("2026-11-17"); i++) await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(days(laptop.state), ["2026-11-17"], "the phone's day arrived after the laptop's own save");
  assert.ok(JSON.stringify(cloud.row!.data).includes("Newspaper"), "and the laptop's habit is in the cloud");
  laptop.engine.stop();
  phone.engine.stop();
});

test("the client's destructive rule matches the server's thresholds", () => {
  const m = month();
  assert.equal(destructiveSummary(m, m), null);
  const fewer = { ...m, journal: (m.journal as unknown[]).slice(3) };
  assert.equal(destructiveSummary(m, fewer), null, "deleting a few days is ordinary editing");
  assert.ok(destructiveSummary(m, { ...m, lifeLog: [] }), "a list of ten or more losing half");
  assert.ok(destructiveSummary(m, blankAccount())?.profileReset, "undoing setup");
  const small = { journal: [{ date: "a" }, { date: "b" }, { date: "c" }], goals: [{ id: 1 }, { id: 2 }, { id: 3 }], habits: [{ id: 1 }] };
  assert.ok(destructiveSummary(small, { ...small, journal: [], goals: [] }), "two lists of three emptied at once");
  assert.equal(destructiveSummary(small, { ...small, journal: [] }), null, "one small list emptied is not");
});
