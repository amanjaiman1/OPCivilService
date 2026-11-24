/* ════════════════════════════════════════════════════════════════
   WHAT A SNAPSHOT HOLDS, IN COUNTS
   The client-side twin of `chronicle_counts` / `chronicle_is_blank` in
   `supabase/migrations/20261216120000_sync_safety.sql`. Keep the two lists
   in step. Counts only: nothing here reads what was written.
   ════════════════════════════════════════════════════════════════ */

import type { Snapshot } from "./engine";

/** The personal lists the server's destructive-change guard counts. */
export const COUNTED_LISTS = [
  "journal",
  "lifeLog",
  "goals",
  "habits",
  "reflections",
  "revisions",
  "plans",
  "milestones",
  "mocks",
  "mistakes",
  "currentAffairs",
  "reviews",
  "sleep",
  "exercise",
  "accomplished",
] as const;

export type CountedList = (typeof COUNTED_LISTS)[number] | "topicsTouched";

export function countRecords(snap: Snapshot): Record<CountedList, number> {
  const out = {} as Record<CountedList, number>;
  for (const k of COUNTED_LISTS) {
    const v = snap[k];
    out[k] = Array.isArray(v) ? v.length : 0;
  }
  let touched = 0;
  const subjects = Array.isArray(snap.subjects) ? (snap.subjects as unknown[]) : [];
  for (const sub of subjects) {
    const topics = (sub as { topics?: unknown })?.topics;
    if (!Array.isArray(topics)) continue;
    for (const t of topics as { status?: unknown; revisionCount?: unknown }[]) {
      if (!t || typeof t !== "object") continue;
      if ((t.status ?? "untouched") !== "untouched") touched++;
      else if (typeof t.revisionCount === "number" && t.revisionCount > 0) touched++;
    }
  }
  out.topicsTouched = touched;
  return out;
}

/**
 * An untouched template: first-run setup never finished and nothing personal
 * recorded (the template's suggested habits don't count). What a fresh or
 * wiped browser holds before the account's data arrives.
 */
export function isBlankSnapshot(snap: Snapshot): boolean {
  const profile = snap.profile as { onboardedAt?: unknown } | undefined;
  if (profile && typeof profile.onboardedAt === "string" && profile.onboardedAt) return false;
  const counts = countRecords(snap);
  return (Object.keys(counts) as CountedList[]).every((k) => k === "habits" || counts[k] === 0);
}

/** Display names for the lists, for the messages that mention them. */
export const LIST_LABELS: Record<CountedList, string> = {
  journal: "journal days",
  lifeLog: "Life Dashboard days",
  goals: "goals",
  habits: "habits",
  reflections: "diary entries",
  revisions: "revision items",
  plans: "Roadmap plans",
  milestones: "milestones",
  mocks: "mock tests",
  mistakes: "mistakes",
  currentAffairs: "current affairs notes",
  reviews: "performance reviews",
  sleep: "nights of sleep",
  exercise: "exercise days",
  accomplished: "accomplished days",
  topicsTouched: "syllabus topics in progress",
};

/** What replacing `before` with `after` would remove, list by list: `[before, after]`. */
export interface LossSummary {
  removed: number;
  before: number;
  lists: Record<string, [number, number]>;
  profileReset: boolean;
}

/**
 * The same rule as the server's `chronicle_destructive_summary`: null for
 * ordinary editing; otherwise what would be lost. Large when half or more of
 * a non-trivial history goes at once, when two or more lists of three or more
 * records are emptied, when a list of ten or more loses half, or when
 * first-run setup is undone.
 */
export function destructiveSummary(before: Snapshot, after: Snapshot): LossSummary | null {
  const oc = countRecords(before);
  const nc = countRecords(after);
  let total = 0;
  let removed = 0;
  let emptied = 0;
  let bigDrop = false;
  const lists: Record<string, [number, number]> = {};
  for (const k of Object.keys(oc) as CountedList[]) {
    const o = oc[k];
    const n = nc[k];
    total += o;
    if (n < o) {
      removed += o - n;
      lists[k] = [o, n];
      if (o >= 3 && n === 0) emptied++;
      if (o >= 10 && n * 2 <= o) bigDrop = true;
    }
  }
  const onboarded = (s: Snapshot) => {
    const at = (s.profile as { onboardedAt?: unknown } | undefined)?.onboardedAt;
    return typeof at === "string" && at.length > 0;
  };
  const profileReset = onboarded(before) && !onboarded(after);
  if (profileReset || (removed >= 10 && removed * 2 >= total) || emptied >= 2 || bigDrop) {
    return { removed, before: total, lists, profileReset };
  }
  return null;
}

/** What is known about the copy a browser holds when an account is opened. */
export interface LocalCopyFacts {
  /** A signed-in, syncing account (not local-only or demo). */
  cloud: boolean;
  /** The store's stamp names this account and a cloud version. */
  stampOk: boolean;
  /** The store carries any stamp at all. */
  hasStamp: boolean;
  /** The copy is an untouched template (`isBlankSnapshot`). */
  blank: boolean;
  /** Pre-account data was moved into the account on this load. */
  legacy: boolean;
  /** This browser has completed a sync for the account before. */
  ready: boolean;
  /** A stored copy existed before this load. */
  hadStore: boolean;
  /** The stored copy couldn't be used and was set aside. */
  quarantined: boolean;
}

/**
 * How far a browser's copy can be trusted (see `Activation` in
 * `lib/account/session.ts`). The rules, in short: a stamped copy is the
 * account's; a blank copy without a stamp is nothing (adopt the cloud's); a
 * copy from before stamps is trusted only when its storage is visibly intact.
 */
export function assessLocalCopy(f: LocalCopyFacts): {
  pristine: boolean;
  verified: boolean;
  trustUnstampedBase: boolean;
} {
  const pristine = f.cloud && !f.stampOk && !f.legacy && f.blank;
  const trustUnstampedBase =
    f.cloud && !f.stampOk && !pristine && !f.quarantined && f.ready && f.hadStore && !f.hasStamp;
  const verified = !f.cloud || f.stampOk || trustUnstampedBase;
  return { pristine, verified, trustUnstampedBase };
}
