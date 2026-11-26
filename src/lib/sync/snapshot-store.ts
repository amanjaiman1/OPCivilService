import { SNAPSHOT_KEYS, snapshotFromState, type CloudSnapshot, type createChronicleStore } from "../chronicle-store";
import { normalizePlans } from "../roadmap";
import type { LocalStoreAdapter, Snapshot } from "./engine";

/**
 * The sync engine's view of the zustand store: the synced slice, plus the
 * stamp saying which cloud version of `accountId` it descends from (kept in
 * the same persisted entry). Changes to device-only state (delivery
 * bookkeeping, the hydration flag, the stamp itself) are ignored, so they
 * never trigger a cloud round trip.
 */
export function snapshotStoreAdapter(accountId: string, store: ReturnType<typeof createChronicleStore>): LocalStoreAdapter {
  return {
    read: () => snapshotFromState(store.getState()) as unknown as Snapshot,
    prepareMerge: (snapshot) => snapshot.plans === undefined ? snapshot : { ...snapshot, plans: normalizePlans(snapshot.plans) },
    readStamp: () => {
      const stamp = store.getState()._sync;
      return stamp && stamp.accountId === accountId && Number.isFinite(stamp.version) && stamp.version > 0
        ? stamp.version
        : null;
    },
    apply: (next, version) =>
      store
        .getState()
        .applyCloudSnapshot(next as unknown as Partial<CloudSnapshot> | null, {
          accountId,
          version,
          at: new Date().toISOString(),
        }),
    subscribe: (onChange) =>
      store.subscribe((state, prev) => {
        for (const key of SNAPSHOT_KEYS) {
          if (state[key] !== prev[key]) {
            onChange();
            return;
          }
        }
      }),
  };
}
