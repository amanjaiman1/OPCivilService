"use client";

import { useStore } from "zustand";
import { accountStorage, STORE_KEY, writeAppearance } from "./account/scope";
import { createChronicleStore, snapshotFromState } from "./chronicle-store";
import { applyThemeMode, applyTransparency } from "./theme";

export {
  blankChronicleState,
  SNAPSHOT_KEYS,
  STORE_VERSION,
  type CloudSnapshot,
  type FileLinkTarget,
  type HabitInput,
  type JournalSaveResult,
  type SyncStamp,
} from "./chronicle-store";

const store = createChronicleStore({
  storage: accountStorage,
  key: STORE_KEY,
  appearance: {
    theme(mode, animate) {
      applyThemeMode(mode, { animate });
      writeAppearance("theme", mode);
    },
    transparency(reduced, animate) {
      applyTransparency(reduced, { animate });
      writeAppearance("transparency", reduced ? "reduced" : "auto");
    },
  },
});

export const useChronicle = Object.assign(useBoundChronicle, store);
export const lastHydrationFailed = store.lastHydrationFailed;

function useBoundChronicle<T>(select: (state: ReturnType<typeof store.getState>) => T): T {
  return useStore(store, select);
}

export function useHasHydrated(): boolean {
  return useChronicle((s) => s._hasHydrated);
}

export function readCloudSnapshot() {
  return snapshotFromState(store.getState());
}
