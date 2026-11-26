/* ════════════════════════════════════════════════════════════════
   THE SYNC ENGINE
   Keeps one account's local snapshot and its cloud copy in step, without
   ever letting one device silently overwrite another, and without ever
   letting an empty or unverified copy stand in for the student's data.

   Every cloud write names the version it was based on. If another device
   saved in between, the write is refused, the newer copy is pulled, the
   two are merged (see `merge.ts`) and the merge is saved instead. Reading
   is cheap: a "head" request returns just the version, and the full
   snapshot is only downloaded when that version has moved.

   What makes a local copy trustworthy
   A three-way merge measures this device's edits against the copy both
   sides last agreed on (the "base", kept in IndexedDB). That is only valid
   if the local copy really descends from that base. The local store
   records which cloud version it descends from (its "stamp") in the same
   storage entry as the data, so they are written, cleared and restored
   together. A base whose version doesn't match the stamp is never used to
   infer deletions: a wiped store next to a surviving base (the way a
   month of data was once replaced by an empty template) is a copy with
   nothing in it, not a student who deleted everything.

   What the cloud decides
   - A missing row is never filled by this device on its own say-so. The
     server's `chronicle_init` decides: a genuinely new account gets its
     first snapshot; an account whose snapshot existed before, or an old
     account offering only an empty template, goes to recovery.
   - A save that would remove a large share of the account is "held" by
     the server, not applied. The student decides: bring the cloud's data
     back (kept alongside this device's additions), or confirm, which the
     server applies only for that exact payload after keeping a copy.
   - A save from an app version older than the one that last wrote the
     account is refused ("outdated") until the app reloads.

   No React, no browser globals: the transport, the local store and the
   place the last-synced copy is kept are all passed in, which is what lets
   the tests run simulated devices against one fake server.
   ════════════════════════════════════════════════════════════════ */

import { deepEqual, merge3, mergeTwoWay, type MergeConflict } from "./merge";
import { destructiveSummary, isBlankSnapshot, type LossSummary } from "./integrity";

export type Snapshot = Record<string, unknown>;

export interface RemoteHead {
  version: number;
  updatedAt: string | null;
  /** The snapshot schema of the app version that last wrote the row. */
  schema?: number;
}

export interface RemoteDoc extends RemoteHead {
  data: Snapshot;
}

/** What a held save would have removed, list by list: `[before, after]`. */
export type HoldSummary = LossSummary;

export interface SyncHold {
  id: string;
  summary: HoldSummary;
}

/**
 * Why the account can't be opened from the cloud:
 * - missing: it had a cloud copy, and the row is gone;
 * - unrecognised: an older account with no cloud copy, and this device has
 *   nothing of it either.
 */
export type RecoveryReason = "missing" | "unrecognised";

/** auto: the app's own first contact. fresh / device: the student's choice on the recovery screen. */
export type InitIntent = "auto" | "fresh" | "device";

export type SaveOutcome =
  | { status: "saved"; head: RemoteHead }
  | { status: "conflict"; head: RemoteHead }
  | { status: "missing" }
  | { status: "held"; head: RemoteHead; hold: SyncHold }
  | { status: "outdated"; head: RemoteHead }
  /** Confirming a hold that no longer applies (used, replaced, timed out, or another payload). */
  | { status: "expired" };

export type InitOutcome =
  | { status: "created"; head: RemoteHead }
  | { status: "exists"; head: RemoteHead }
  | { status: "needs_recovery"; reason: RecoveryReason };

export type SyncErrorKind = "network" | "auth" | "schema" | "rejected" | "server" | "stopped";

export class SyncError extends Error {
  constructor(
    message: string,
    readonly kind: SyncErrorKind,
  ) {
    super(message);
    this.name = "SyncError";
  }
}

/** Device-side events worth keeping in the account's diagnostic trail. Metadata only. */
export type SyncReport =
  | "stamp_mismatch"
  | "conflicts_recorded"
  | "outdated_client"
  | "hold_kept_cloud";

export type ReportDetail = Record<string, string | number | boolean | null>;

export interface SyncTransport {
  /** The row's version, or null when there is no row. */
  head(): Promise<RemoteHead | null>;
  fetch(): Promise<RemoteDoc | null>;
  save(data: Snapshot, baseVersion: number): Promise<SaveOutcome>;
  /** Asks the server to create the account's first snapshot. The server decides. */
  init(data: Snapshot, intent: InitIntent): Promise<InitOutcome>;
  /** Applies a held save: only that hold, only that payload. */
  confirmReplace(holdId: string, data: Snapshot): Promise<SaveOutcome>;
  report?(event: SyncReport, version: number | null, detail?: ReportDetail): void;
}

export interface LocalStoreAdapter {
  read(): Snapshot;
  /** Project old records into the current merge shape before comparing edits. */
  prepareMerge?(snapshot: Snapshot): Snapshot;
  /**
   * Replaces the local copy with `next` (or leaves it, when null) and records,
   * in the same write, the cloud version it now descends from.
   */
  apply(next: Snapshot | null, stamp: number): void;
  /** The cloud version the local copy descends from, or null when it can't say. */
  readStamp(): number | null;
  subscribe(onChange: () => void): () => void;
}

/** The copy both sides last agreed on — what a three-way merge measures edits against. */
export interface SyncBase {
  version: number;
  data: Snapshot;
}

export interface BaseStore {
  load(): Promise<SyncBase | null>;
  save(base: SyncBase): Promise<void>;
}

/**
 * idle / syncing / synced / offline / error: the ordinary cycle.
 * held: a save would have removed much of the account; waiting for the student.
 * recovery: the cloud can't say which copy is the account's; nothing is written.
 * outdated: a newer app version wrote the account; this one must reload to save.
 */
export type SyncStatus =
  | "idle"
  | "syncing"
  | "synced"
  | "offline"
  | "error"
  | "held"
  | "recovery"
  | "outdated";

export interface SyncState {
  status: SyncStatus;
  /** Local changes that have not reached the cloud yet. */
  pending: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  errorKind: SyncErrorKind | null;
  hold: SyncHold | null;
  recovery: RecoveryReason | null;
  /** The cloud version this device last agreed with. */
  baseVersion: number | null;
}

export interface SyncEngineOptions {
  transport: SyncTransport;
  store: LocalStoreAdapter;
  baseStore: BaseStore;
  /**
   * This device holds nothing of the account worth keeping (a blank copy with
   * no stamp), so the cloud's copy is taken as it is on first contact.
   */
  pristine: boolean;
  /**
   * For a device from before stamps existed, whose storage is intact (it has
   * completed a sync and its store was read cleanly): trust its synced copy
   * once, and stamp the local copy with it.
   */
  trustUnstampedBase?: boolean;
  /** The snapshot schema this app writes; a cloud copy from a higher one makes it "outdated". */
  schema: number;
  /**
   * Set once, for data saved on this device before versioned sync existed:
   * the time it last synced under the old scheme. Lets the first sync decide
   * whether the local copy is the newer one.
   */
  legacy?: { syncedAt: string | null } | null;
  debounceMs?: number;
  maxWaitMs?: number;
  onState?: (state: SyncState) => void;
  onConflicts?: (conflicts: MergeConflict[]) => void;
  /**
   * Called before a change from the cloud removes a large share of what this
   * device holds (another device's confirmed clean-up, or damage done before
   * the server guarded against it), with this device's copy as it was, so a
   * copy of it can be kept on the device. The change is still applied.
   */
  onRemoteRemoval?: (summary: LossSummary, before: Snapshot) => void;
  /** Called after the first successful sync when `legacy` was set. */
  onLegacySettled?: () => void;
  timers?: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
  };
}

type EngineAction =
  | { kind: "confirm" }
  | { kind: "restore" }
  | { kind: "init"; intent: Exclude<InitIntent, "auto"> };

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
const SLOW_RETRY_MS = 5 * 60_000;
const MAX_CONFLICT_ROUNDS = 4;
const MAX_INIT_DEPTH = 2;

export class SyncEngine {
  private readonly o: SyncEngineOptions;
  private readonly timers: NonNullable<SyncEngineOptions["timers"]>;
  private base: SyncBase | null = null;
  /** With no trusted base: the cloud version the local copy is known to descend from. */
  private descendsFrom: number | null = null;
  private pristine: boolean;
  private hold: (SyncHold & { payload: Snapshot }) | null = null;
  private recoveryReason: RecoveryReason | null = null;
  private outdated = false;
  private action: EngineAction | null = null;
  private initDepth = 0;
  private stopped = false;
  private applying = false;
  private unsubscribe: (() => void) | null = null;
  private running: Promise<void> | null = null;
  private rerun = false;
  /** A check for other devices' changes asked for while a sync was running. */
  private recheck = false;
  private lastOk = false;
  private debounceTimer: unknown = null;
  private firstPendingAt: number | null = null;
  private retryTimer: unknown = null;
  private retryIndex = 0;
  private legacy: SyncEngineOptions["legacy"];
  private state: SyncState = {
    status: "idle",
    pending: false,
    lastSyncedAt: null,
    error: null,
    errorKind: null,
    hold: null,
    recovery: null,
    baseVersion: null,
  };

  constructor(options: SyncEngineOptions) {
    this.o = options;
    this.legacy = options.legacy ?? null;
    this.pristine = options.pristine;
    this.timers = options.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    };
  }

  getState(): SyncState {
    return this.state;
  }

  /** Loads the last agreed copy, checks it belongs to the local one, and runs the first sync. Never throws. */
  async start(): Promise<boolean> {
    let stored: SyncBase | null = null;
    try {
      stored = await this.o.baseStore.load();
    } catch {
      stored = null;
    }
    // The active account can change while the platform opens its local database.
    if (this.stopped) return false;
    const stamp = this.o.store.readStamp();
    if (stored && stamp === stored.version) {
      this.base = stored;
    } else if (stored && stamp == null && this.o.trustUnstampedBase && !this.pristine) {
      this.base = stored;
      this.o.store.apply(null, stored.version);
    } else {
      // No synced copy, or one the local copy can't be shown to descend from:
      // the local copy is reconciled with the cloud's without inferring any
      // deletion from it.
      if (stored) this.report("stamp_mismatch", stored.version, { stamp: stamp ?? -1, pristine: this.pristine });
      this.base = null;
      this.descendsFrom = stamp;
    }
    this.setState({ baseVersion: this.base?.version ?? null });
    this.unsubscribe = this.o.store.subscribe(() => {
      if (this.applying || this.stopped) return;
      const keep = this.blocked() || this.state.status === "error" || this.state.status === "offline";
      this.setState({ pending: true, status: keep ? this.state.status : "syncing" });
      this.schedulePush();
    });
    return this.sync();
  }

  /** Stops for good. Anything still in flight is discarded, never applied. */
  stop(): void {
    this.stopped = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.clearTimer("debounceTimer");
    this.clearTimer("retryTimer");
  }

  /**
   * Runs a full sync now. Concurrent calls coalesce into one extra pass. Does
   * nothing while a decision is waiting (held, recovery, outdated).
   */
  sync(): Promise<boolean> {
    if (this.stopped) return Promise.resolve(false);
    if (this.blocked() && !this.action) return Promise.resolve(false);
    if (this.running) {
      this.rerun = true;
      return this.running.then(() => this.lastOk);
    }
    this.clearTimer("debounceTimer");
    this.firstPendingAt = null;
    this.running = (async () => {
      do {
        this.rerun = false;
        await this.cycle();
      } while (this.rerun && !this.stopped);
    })().finally(() => {
      this.running = null;
      if (this.recheck && !this.stopped) {
        this.recheck = false;
        void this.checkRemote();
      }
    });
    return this.running.then(() => this.lastOk);
  }

  /** "Try again": leaves recovery and asks the cloud afresh. */
  retry(): Promise<boolean> {
    if (this.recoveryReason) {
      this.recoveryReason = null;
      this.setState({ status: "idle", recovery: null, error: null, errorKind: null });
    }
    this.retryIndex = 0;
    return this.sync();
  }

  /**
   * The student's answer to a held save. "restore": bring back everything the
   * cloud has, keeping what this device added. "confirm": apply the held save.
   */
  resolveHold(choice: "restore" | "confirm"): Promise<boolean> {
    if (!this.hold || this.stopped) return Promise.resolve(false);
    this.action = { kind: choice };
    return this.sync();
  }

  /** From the recovery screen: create the cloud copy from this device's data, or start empty. */
  initialise(intent: "fresh" | "device"): Promise<boolean> {
    if (!this.recoveryReason || this.stopped) return Promise.resolve(false);
    this.action = { kind: "init", intent };
    return this.sync();
  }

  /**
   * Cheap check for changes made on another device; pulls only if there are
   * some. `hint.version` is the version a live update says the cloud is at
   * now: when this device already has it (the update was about its own
   * save) there's nothing to ask. A check that arrives during a sync runs
   * once that sync is done, so a change saved meanwhile isn't missed.
   */
  async checkRemote(hint?: { version?: number | null }): Promise<void> {
    if (this.stopped || this.blocked()) return;
    const known = hint?.version;
    if (typeof known === "number" && this.base && known <= this.base.version) return;
    if (this.running) {
      this.recheck = true;
      return;
    }
    if (this.state.pending) {
      await this.sync();
      return;
    }
    try {
      const head = await this.o.transport.head();
      this.assertLive();
      if (!head || !this.base || head.version !== this.base.version) await this.sync();
    } catch (e) {
      this.fail(e);
    }
  }

  /**
   * Whether this device holds anything the cloud doesn't: the local copy
   * differs from the one both last agreed on, or there has been no agreement
   * yet this session (a first sync still on its way counts as unsynced).
   */
  hasUnsyncedChanges(): boolean {
    return this.base ? !deepEqual(this.o.store.read(), this.base.data) : true;
  }

  /** Pushes anything pending and waits, up to `timeoutMs`. True when fully in sync. */
  async flush(timeoutMs = 8_000): Promise<boolean> {
    if (this.stopped || this.blocked()) return false;
    if (!this.state.pending && this.state.status === "synced" && !this.running) return true;
    let timer: unknown = null;
    const timeout = new Promise<boolean>((resolve) => {
      timer = this.timers.setTimeout(() => resolve(false), timeoutMs);
    });
    const ok = await Promise.race([this.sync(), timeout]);
    this.timers.clearTimeout(timer);
    return ok && !this.state.pending;
  }

  /* ── internals ─────────────────────────────────────────────── */

  private blocked(): boolean {
    return Boolean(this.hold || this.recoveryReason || this.outdated);
  }

  private async cycle(): Promise<void> {
    if (this.stopped) return;
    const action = this.action;
    this.action = null;
    if (!action && this.blocked()) {
      this.lastOk = false;
      return;
    }
    this.initDepth = 0;
    this.setState({ status: "syncing", error: null, errorKind: null });
    try {
      if (action) await this.perform(action);
      else await this.reconcile();
      if (this.blocked()) {
        this.lastOk = false;
        return;
      }
      this.settled();
    } catch (e) {
      this.lastOk = false;
      this.fail(e);
    }
  }

  private async reconcile(): Promise<void> {
    this.checkStamp();
    if (!this.base) {
      // Nothing agreed on this device yet (a fresh browser, a wiped one, or a
      // first sync still to finish): the full copy is needed either way.
      const doc = await this.o.transport.fetch();
      this.assertLive();
      if (!doc) await this.initialiseRemote("auto");
      else await this.integrate(doc);
      return;
    }
    const head = await this.o.transport.head();
    this.assertLive();
    if (!head) {
      await this.initialiseRemote("auto");
      return;
    }
    if (this.isOutdated(head)) return;
    if (head.version === this.base.version) {
      const local = this.o.store.read();
      if (deepEqual(local, this.base.data)) this.markSynced(head);
      else await this.pushLoop(local, this.base.version);
      return;
    }
    const doc = await this.o.transport.fetch();
    this.assertLive();
    if (!doc) await this.initialiseRemote("auto");
    else await this.integrate(doc);
  }

  /**
   * Re-checks that the local copy descends from the synced copy kept here.
   * It may not, when another tab of this account saved a copy written before
   * it heard of the latest sync. Then nothing is inferred as deleted: both
   * are kept, item by item, this tab's values winning a clash.
   */
  private checkStamp(): void {
    if (!this.base) return;
    const stamp = this.o.store.readStamp();
    if (stamp === this.base.version) return;
    if (stamp != null && stamp > this.base.version) {
      // The local copy is newer than the synced copy kept here (that write was lost).
      this.base = null;
      this.descendsFrom = stamp;
      return;
    }
    const local = this.o.store.read();
    const prefer = isBlankSnapshot(local) ? "remote" : "local";
    const { value } = this.mergeTwoWay(local, this.base.data, prefer);
    this.writeLocal(value, local, this.base.version);
  }

  private mergeThreeWay(base: Snapshot, local: Snapshot, remote: Snapshot) {
    const prepare = this.o.store.prepareMerge;
    return prepare ? merge3(prepare(base), prepare(local), prepare(remote)) : merge3(base, local, remote);
  }

  private mergeTwoWay(local: Snapshot, remote: Snapshot, prefer: "local" | "remote") {
    const prepare = this.o.store.prepareMerge;
    return prepare ? mergeTwoWay(prepare(local), prepare(remote), prefer) : mergeTwoWay(local, remote, prefer);
  }

  /**
   * Folds a newer cloud copy into the local one and saves the result if it
   * differs from the cloud.
   */
  private async integrate(doc: RemoteDoc): Promise<void> {
    if (this.isOutdated(doc)) return;
    const local = this.o.store.read();
    let merged: Snapshot;
    let conflicts: MergeConflict[] = [];

    if (this.base) {
      if (deepEqual(local, this.base.data)) merged = doc.data;
      else ({ value: merged, conflicts } = this.mergeThreeWay(this.base.data, local, doc.data));
    } else if (this.pristine && !this.legacy) {
      // A blank, unstamped copy: nothing here to keep.
      merged = doc.data;
    } else if (this.descendsFrom != null && this.descendsFrom === doc.version) {
      // Exactly the cloud's copy plus this device's edits.
      merged = local;
    } else if (this.legacy && this.cloudUnchangedSinceLegacySync(doc)) {
      merged = local;
    } else {
      // No common ancestor: keep everything from both, the cloud's wins on a clash.
      ({ value: merged, conflicts } = this.mergeTwoWay(local, doc.data, "remote"));
    }

    this.guardRemoval(local, merged);
    await this.commit({ version: doc.version, data: doc.data }, merged, local);
    this.recordConflicts(conflicts, doc.version);

    const now = this.o.store.read();
    if (deepEqual(now, doc.data)) this.markSynced(doc);
    else await this.pushLoop(now, doc.version);
  }

  private cloudUnchangedSinceLegacySync(doc: RemoteDoc): boolean {
    const at = this.legacy?.syncedAt ? Date.parse(this.legacy.syncedAt) : NaN;
    const remoteAt = doc.updatedAt ? Date.parse(doc.updatedAt) : NaN;
    return Number.isFinite(at) && Number.isFinite(remoteAt) && remoteAt <= at;
  }

  private async pushLoop(data: Snapshot, baseVersion: number): Promise<void> {
    let payload = data;
    let version = baseVersion;
    for (let round = 0; round < MAX_CONFLICT_ROUNDS; round++) {
      this.assertLive();
      const outcome = await this.o.transport.save(payload, version);
      this.assertLive();
      switch (outcome.status) {
        case "saved":
          await this.commit({ version: outcome.head.version, data: payload }, null);
          this.markSynced(outcome.head);
          return;
        case "held":
          this.enterHold(outcome.hold, payload);
          return;
        case "outdated":
          this.enterOutdated(outcome.head);
          return;
        case "missing":
          // The row is gone. Never re-created from here: the server decides.
          await this.initialiseRemote("auto");
          return;
        case "conflict": {
          // Someone else saved first. Pull their copy and merge before trying again.
          const doc = await this.o.transport.fetch();
          this.assertLive();
          if (!doc) {
            await this.initialiseRemote("auto");
            return;
          }
          if (this.isOutdated(doc)) return;
          await this.integrateAfterRefusal(doc);
          payload = this.o.store.read();
          version = doc.version;
          if (deepEqual(payload, doc.data)) {
            this.markSynced(doc);
            return;
          }
          continue;
        }
        default:
          throw new SyncError("The cloud gave an answer this version doesn't understand.", "server");
      }
    }
    throw new SyncError("Another device kept saving at the same moment. Will retry.", "server");
  }

  private async integrateAfterRefusal(doc: RemoteDoc): Promise<void> {
    const local = this.o.store.read();
    let merged: Snapshot;
    let conflicts: MergeConflict[] = [];
    if (this.base) ({ value: merged, conflicts } = this.mergeThreeWay(this.base.data, local, doc.data));
    else ({ value: merged, conflicts } = this.mergeTwoWay(local, doc.data, this.legacy ? "local" : "remote"));
    this.guardRemoval(local, merged);
    await this.commit({ version: doc.version, data: doc.data }, merged, local);
    this.recordConflicts(conflicts, doc.version);
  }

  /** Asks the server for the account's first snapshot; it decides whether there may be one. */
  private async initialiseRemote(intent: InitIntent): Promise<void> {
    if (++this.initDepth > MAX_INIT_DEPTH) {
      throw new SyncError("The cloud's answers didn't add up. Will retry.", "server");
    }
    const payload = this.o.store.read();
    const outcome = await this.o.transport.init(payload, intent);
    this.assertLive();
    if (outcome.status === "created") {
      await this.commit({ version: outcome.head.version, data: payload }, null);
      this.markSynced(outcome.head);
      return;
    }
    if (outcome.status === "exists") {
      const doc = await this.o.transport.fetch();
      this.assertLive();
      if (!doc) throw new SyncError("Your cloud copy couldn't be read yet. Will retry.", "server");
      await this.integrate(doc);
      return;
    }
    this.enterRecovery(outcome.reason);
  }

  private async perform(action: EngineAction): Promise<void> {
    if (action.kind === "init") {
      await this.initialiseRemote(action.intent);
      return;
    }
    const hold = this.hold;
    if (!hold) return;

    if (action.kind === "confirm") {
      const outcome = await this.o.transport.confirmReplace(hold.id, hold.payload);
      this.assertLive();
      this.clearHold();
      if (outcome.status === "saved") {
        await this.commit({ version: outcome.head.version, data: hold.payload }, null);
        this.markSynced(outcome.head);
        return;
      }
      if (outcome.status === "outdated") {
        this.enterOutdated(outcome.head);
        return;
      }
      // The question no longer applies (another device saved, or it timed out). Look again.
      await this.reconcile();
      return;
    }

    // restore: everything in the cloud comes back; what this device added stays.
    const doc = await this.o.transport.fetch();
    this.assertLive();
    this.clearHold();
    if (!doc) {
      await this.initialiseRemote("auto");
      return;
    }
    if (this.isOutdated(doc)) return;
    const local = this.o.store.read();
    const { value, conflicts } = this.mergeTwoWay(local, doc.data, "remote");
    this.report("hold_kept_cloud", doc.version, { removed: hold.summary.removed });
    await this.commit({ version: doc.version, data: doc.data }, value, local);
    this.recordConflicts(conflicts, doc.version);
    const now = this.o.store.read();
    if (deepEqual(now, doc.data)) this.markSynced(doc);
    else await this.pushLoop(now, doc.version);
  }

  /**
   * Agrees on `base`: the local copy becomes `next` (null: stays as it is)
   * and is stamped with the base's version in the same write, and only then
   * is the base itself stored. Interrupted between the two, the stamp and the
   * stored base disagree, and the next start reconciles without inferring
   * deletions, which is safe.
   */
  private async commit(base: SyncBase, next: Snapshot | null, current?: Snapshot): Promise<void> {
    this.assertLive();
    const changed = next !== null && !(current && deepEqual(next, current));
    this.writeLocal(changed ? next : null, current ?? null, base.version);
    this.base = base;
    this.descendsFrom = null;
    this.pristine = false;
    try {
      await this.o.baseStore.save(base);
    } catch {
      /* the in-memory copy still serves this session; the stamp keeps the next one safe */
    }
  }

  private writeLocal(next: Snapshot | null, current: Snapshot | null, stamp: number): void {
    this.assertLive();
    if (next && current && deepEqual(next, current)) next = null;
    this.applying = true;
    try {
      this.o.store.apply(next, stamp);
    } finally {
      this.applying = false;
    }
  }

  /** Before a merge takes much away from this device, let it keep a copy. */
  private guardRemoval(before: Snapshot, after: Snapshot): void {
    if (this.pristine && !this.legacy) return;
    const loss = destructiveSummary(before, after);
    if (!loss) return;
    try {
      this.o.onRemoteRemoval?.(loss, before);
    } catch {
      /* keeping the copy is best effort; the merge itself is still correct */
    }
  }

  private clearHold(): void {
    this.hold = null;
    if (this.state.hold) this.setState({ hold: null });
  }

  private recordConflicts(conflicts: MergeConflict[], version: number): void {
    if (!conflicts.length) return;
    this.o.onConflicts?.(conflicts);
    this.report("conflicts_recorded", version, { count: conflicts.length });
  }

  private isOutdated(head: RemoteHead): boolean {
    if ((head.schema ?? 0) <= this.o.schema) return false;
    this.enterOutdated(head);
    return true;
  }

  private enterHold(hold: SyncHold, payload: Snapshot): void {
    this.hold = { ...hold, payload };
    this.setState({ status: "held", hold, pending: true, error: null, errorKind: null });
  }

  private enterRecovery(reason: RecoveryReason): void {
    this.recoveryReason = reason;
    this.setState({ status: "recovery", recovery: reason, error: null, errorKind: null });
  }

  private enterOutdated(head: RemoteHead): void {
    if (!this.outdated) this.report("outdated_client", head.version, { cloud: head.schema ?? null, client: this.o.schema });
    this.outdated = true;
    this.setState({
      status: "outdated",
      pending: this.hasUnsyncedChanges(),
      error: null,
      errorKind: null,
    });
  }

  /** A cycle that reached the cloud and agreed with it. */
  private settled(): void {
    this.lastOk = true;
    this.retryIndex = 0;
    if (this.legacy) {
      this.legacy = null;
      this.o.onLegacySettled?.();
    }
  }

  private markSynced(head: RemoteHead): void {
    const pending = this.base ? !deepEqual(this.o.store.read(), this.base.data) : true;
    this.recoveryReason = null;
    this.setState({
      status: "synced",
      pending,
      lastSyncedAt: head.updatedAt ?? new Date().toISOString(),
      error: null,
      errorKind: null,
      hold: null,
      recovery: null,
      baseVersion: this.base?.version ?? null,
    });
    if (pending) this.schedulePush();
  }

  private fail(e: unknown): void {
    if (this.stopped) return;
    const err =
      e instanceof SyncError ? e : new SyncError(e instanceof Error ? e.message : String(e), "network");
    if (err.kind === "stopped") return;
    if (this.blocked()) {
      // A decision is on screen: keep it there, say what went wrong, and let
      // the student try again rather than retrying behind their back.
      const status: SyncStatus = this.hold ? "held" : this.recoveryReason ? "recovery" : "outdated";
      this.setState({ status, error: err.message, errorKind: err.kind });
      return;
    }
    const offline = err.kind === "network" || err.kind === "auth";
    this.setState({
      status: offline ? "offline" : "error",
      error: err.message,
      errorKind: err.kind,
      pending: this.base ? !deepEqual(this.o.store.read(), this.base.data) : true,
    });
    const slow = err.kind === "schema" || err.kind === "rejected";
    const delay = slow
      ? SLOW_RETRY_MS
      : RETRY_DELAYS_MS[Math.min(this.retryIndex, RETRY_DELAYS_MS.length - 1)];
    this.retryIndex++;
    this.clearTimer("retryTimer");
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      void this.sync();
    }, delay);
  }

  private schedulePush(): void {
    if (this.stopped || this.blocked()) return;
    const debounce = this.o.debounceMs ?? 2_000;
    const maxWait = this.o.maxWaitMs ?? 10_000;
    const now = Date.now();
    if (this.firstPendingAt == null) this.firstPendingAt = now;
    const wait = Math.max(0, Math.min(debounce, this.firstPendingAt + maxWait - now));
    this.clearTimer("debounceTimer");
    this.debounceTimer = this.timers.setTimeout(() => {
      this.debounceTimer = null;
      void this.sync();
    }, wait);
  }

  private clearTimer(which: "debounceTimer" | "retryTimer"): void {
    if (this[which] != null) this.timers.clearTimeout(this[which]);
    this[which] = null;
  }

  private report(event: SyncReport, version: number | null, detail?: ReportDetail): void {
    try {
      this.o.transport.report?.(event, version, detail);
    } catch {
      /* diagnostics never get in the way */
    }
  }

  private assertLive(): void {
    if (this.stopped) throw new SyncError("Sync stopped.", "stopped");
  }

  private setState(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    if (!this.stopped) this.o.onState?.(this.state);
  }
}
