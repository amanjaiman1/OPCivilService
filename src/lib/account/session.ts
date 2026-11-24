"use client";

/* ════════════════════════════════════════════════════════════════
   LOADING AND UNLOADING AN ACCOUNT IN THIS TAB
   The order of operations here is the isolation guarantee:

     activate:   point storage at the account → blank the store in memory
                 (writes still off, so the blank never reaches disk) → turn
                 writes on → read the account's saved state.
     deactivate: turn writes off and detach storage first → only then blank
                 the store and reset the look.

   So at no point can one account's state be written under another's key,
   and nothing of the previous account is left in memory.
   ════════════════════════════════════════════════════════════════ */

import { useChronicle, blankChronicleState, lastHydrationFailed, readCloudSnapshot } from "../store";
import type { MergeConflict } from "../sync/merge";
import type { Snapshot } from "../sync/engine";
import { assessLocalCopy, isBlankSnapshot, type LossSummary } from "../sync/integrity";
import { clearBaseStore } from "../sync/base-store";
import { DEFAULT_THEME_MODE, applyThemeMode, applyTransparency } from "../theme";
import {
  STORE_KEY,
  enableWrites,
  eraseAccountKeys,
  readKey,
  removeKey,
  setActiveAccount,
  withoutWrites,
  writeKey,
} from "./scope";
import { claimLegacyData, eraseLegacyMarker, type LegacyClaim } from "./legacy";

/**
 * cloud: a signed-in account that syncs. local: this browser only, in builds
 * without accounts. demo: the sample account of the interactive demo, which
 * is never written anywhere (lib/demo/mode.ts).
 */
export type AccountMode = "cloud" | "local" | "demo";
/** The modes with a real account behind them, which can be activated. */
export type StoredAccountMode = Exclude<AccountMode, "demo">;

export interface Activation {
  accountId: string;
  /** Pre-account data moved into this account on this load, if any. */
  legacy: LegacyClaim | null;
  /**
   * True when this browser holds nothing of the account worth keeping: a
   * blank copy that can't show it came from the cloud, and no old data.
   */
  pristine: boolean;
  /**
   * True when this browser's copy is known to descend from a cloud version of
   * this account (its stamp says so), so it can be opened, and edited, before
   * the network answers or without it. A fresh, wiped or unreadable copy is
   * not: it waits for the cloud.
   */
  verified: boolean;
  /**
   * A device from before stamps existed, with its storage intact: it has
   * completed a sync here and its copy was read cleanly, so its synced copy
   * is trusted once and the stamp written from it.
   */
  trustUnstampedBase: boolean;
  /** The stored copy couldn't be used (unreadable, or another account's) and was set aside. */
  quarantined: boolean;
}

const readyKey = (id: string) => `upsc-chronicle-ready:${id}`;
const conflictsKey = (id: string) => `upsc-chronicle-conflicts:${id}`;
const MAX_CONFLICTS = 30;

export async function activateAccount(accountId: string, mode: StoredAccountMode): Promise<Activation> {
  deactivateAccount();

  const legacy = claimLegacyData(accountId, mode);
  deleteRetiredWallpaperPhotos();
  const ready = readKey(readyKey(accountId)) === "1";
  const raw = readKey(storeKeyFor(accountId));

  setActiveAccount(accountId);
  useChronicle.setState(blankChronicleState());
  enableWrites();
  await useChronicle.persist.rehydrate();

  // A stored copy that can't be used is set aside before anything can write
  // over it, and the account opens blank, to be filled from the cloud. The
  // blank itself is not written to disk.
  let quarantined = false;
  const setAside = (reason: SafetyCopy["reason"]) => {
    if (raw != null) keepSafetyCopy(accountId, { reason, raw });
    withoutWrites(() => useChronicle.setState({ ...blankChronicleState(), _hasHydrated: true }));
    quarantined = true;
  };
  if (lastHydrationFailed()) setAside("unreadable");
  else if (useChronicle.getState()._sync && useChronicle.getState()._sync?.accountId !== accountId) setAside("foreign");

  const stamp = useChronicle.getState()._sync;
  const trust = assessLocalCopy({
    cloud: mode === "cloud",
    stampOk: Boolean(stamp && stamp.accountId === accountId && stamp.version > 0),
    hasStamp: Boolean(stamp),
    blank: isBlankSnapshot(readCloudSnapshot() as unknown as Snapshot),
    legacy: Boolean(legacy),
    ready,
    hadStore: raw != null,
    quarantined,
  });
  return { accountId, legacy, quarantined, ...trust };
}

export function deactivateAccount(): void {
  setActiveAccount(null);
  useChronicle.setState(blankChronicleState());
  applyThemeMode(DEFAULT_THEME_MODE);
  applyTransparency(false);
}

/**
 * Older versions let you use your own photo as a wallpaper, kept in this
 * browser's IndexedDB, and later retired wallpapers altogether. This deletes
 * any photos still stored (every account's at once). It runs whenever an
 * account loads; with nothing stored it does nothing.
 */
function deleteRetiredWallpaperPhotos(): void {
  try {
    if (typeof indexedDB !== "undefined") indexedDB.deleteDatabase("upsc-chronicle-media");
  } catch {
    // Storage is blocked in this browser, so no photo could have been saved.
  }
}

/** Records that this browser has completed a sync for the account. */
export function markDeviceReady(accountId: string): void {
  writeKey(readyKey(accountId), "1");
}

export function isDeviceReady(accountId: string): boolean {
  return readKey(readyKey(accountId)) === "1";
}

/** Re-reads the account's state after another tab saved it, without echoing a write. */
export function reloadFromStorage(): void {
  withoutWrites(() => {
    void useChronicle.persist.rehydrate();
  });
}

/** The storage key another tab writes when it saves this account. */
export function storeKeyFor(accountId: string): string {
  return `${STORE_KEY}:${accountId}`;
}

/** Removes everything this browser holds for the account. */
export async function eraseAccountFromDevice(accountId: string): Promise<void> {
  eraseAccountKeys(accountId);
  eraseLegacyMarker(accountId);
  await clearBaseStore(accountId);
}

/* ── safety copies kept on this device ──────────────────────────
   Kept when this device's copy is about to be replaced in a way that could
   lose something the cloud may not have: a stored copy that couldn't be read
   (or carried another account's stamp), and this device's copy just before a
   change from the cloud removed a large share of it. At most two, newest
   first, under the account's own key. Unlike the account's other keys they
   are kept at sign-out (they may be the only copy) and removed when the
   account is deleted or the student discards them (Settings → Data). */

export interface SafetyCopy {
  reason: "unreadable" | "foreign" | "before_cloud_removal";
  at?: string;
  /** The stored entry as it was, for copies that couldn't be read. */
  raw?: string;
  /** This device's synced data, for copies taken before a removal. */
  data?: Snapshot;
  summary?: LossSummary;
}

const safetyKey = (id: string) => `upsc-chronicle-safety:${id}`;
const MAX_SAFETY_COPIES = 2;

export function readSafetyCopies(accountId: string): SafetyCopy[] {
  try {
    const parsed: unknown = JSON.parse(readKey(safetyKey(accountId)) ?? "[]");
    return Array.isArray(parsed) ? (parsed as SafetyCopy[]) : [];
  } catch {
    return [];
  }
}

export function keepSafetyCopy(accountId: string, copy: SafetyCopy): boolean {
  const entry = { ...copy, at: copy.at ?? new Date().toISOString() };
  const list = [entry, ...readSafetyCopies(accountId)].slice(0, MAX_SAFETY_COPIES);
  // Fall back to fewer copies when storage is nearly full.
  for (let n = list.length; n > 0; n--) {
    if (writeKey(safetyKey(accountId), JSON.stringify(list.slice(0, n)))) return true;
  }
  return false;
}

export function discardSafetyCopies(accountId: string): void {
  removeKey(safetyKey(accountId));
}

/* ── the record of edits that clashed between devices ──────────── */

export interface ConflictRecord extends MergeConflict {
  at: string;
}

export function readConflicts(accountId: string): ConflictRecord[] {
  try {
    const raw = readKey(conflictsKey(accountId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ConflictRecord[]) : [];
  } catch {
    return [];
  }
}

export function recordConflicts(accountId: string, conflicts: MergeConflict[]): ConflictRecord[] {
  const at = new Date().toISOString();
  const next = [...conflicts.map((c) => ({ ...c, at })), ...readConflicts(accountId)].slice(
    0,
    MAX_CONFLICTS,
  );
  writeKey(conflictsKey(accountId), JSON.stringify(next));
  return next;
}

export function clearConflicts(accountId: string): void {
  removeKey(conflictsKey(accountId));
}
