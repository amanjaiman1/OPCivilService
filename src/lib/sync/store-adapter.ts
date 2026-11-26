"use client";

import { useChronicle } from "../store";
import { snapshotStoreAdapter } from "./snapshot-store";

export function chronicleStoreAdapter(accountId: string) {
  return snapshotStoreAdapter(accountId, useChronicle);
}
