"use client";

import { useChronicle, readCloudSnapshot, SNAPSHOT_KEYS, type CloudSnapshot } from "../store";
import { normalizePlans } from "../roadmap";
import type { LocalStoreAdapter, Snapshot } from "./engine";

/**
 * The sync engine's view of the zustand store: the synced slice, plus the
 * stamp saying which cloud version of `accountId` it descends from (kept in
 * the same persisted entry). Changes to device-only state (delivery
 * bookkeeping, the hydration flag, the stamp itself) are ignored, so they
 * never trigger a cloud round trip.
 */
export function chronicleStoreAdapter(accountId: string): LocalStoreAdapter {
  return {
    read: () => readCloudSnapshot() as unknown as Snapshot,
    prepareMerge: (snapshot) => snapshot.plans === undefined ? snapshot : { ...snapshot, plans: normalizePlans(snapshot.plans) },
    readStamp: () => {
      const stamp = useChronicle.getState()._sync;
      return stamp && stamp.accountId === accountId && Number.isFinite(stamp.version) && stamp.version > 0
        ? stamp.version
        : null;
    },
    apply: (next, version) =>
      useChronicle
        .getState()
        .applyCloudSnapshot(next as unknown as Partial<CloudSnapshot> | null, {
          accountId,
          version,
          at: new Date().toISOString(),
        }),
    subscribe: (onChange) =>
      useChronicle.subscribe((state, prev) => {
        for (const key of SNAPSHOT_KEYS) {
          if (state[key] !== prev[key]) {
            onChange();
            return;
          }
        }
      }),
  };
}
