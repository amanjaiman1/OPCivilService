import { getDocumentAsync } from "expo-document-picker";
import { parseBackup } from "./backup-data";
import { randomUUID } from "expo-crypto";
import { File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { snapshotFromState, STORE_VERSION } from "../../../src/lib/chronicle-store";
import type { NativeAccount } from "./account";

export async function shareBackup(account: NativeAccount, recovery: boolean) {
  if (!account.isActive() || !(await isAvailableAsync())) throw new Error("Export unavailable");
  const source = recovery ? account.readRecovery() : JSON.stringify(snapshotFromState(account.store.getState()));
  if (!source) throw new Error("No recovery copy");
  const file = new File(Paths.cache, `doordie-backup-${randomUUID()}.json`);
  try {
    file.create();
    file.write(JSON.stringify({
      app: "the-upsc-chronicle", schemaVersion: STORE_VERSION, exportedAt: new Date().toISOString(),
      account: { id: account.id }, data: JSON.parse(source),
    }));
    if (account.isActive()) await shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "DoOrDie private backup" });
  } finally {
    if (file.exists) file.delete();
  }
}

export async function selectBackup(account: NativeAccount) {
  const picked = await getDocumentAsync({ type: ["application/json", "text/plain", "application/octet-stream"], copyToCacheDirectory: true });
  if (picked.canceled) return null;
  const file = new File(picked.assets[0].uri);
  try {
    if (!account.isActive()) return null;
    if (!file.size || file.size > 32 * 1024 * 1024) throw new Error("Choose a backup under 32 MB.");
    const value: unknown = JSON.parse(await file.text());
    const merge = () => parseBackup(value, account.id, snapshotFromState(account.store.getState()));
    merge();
    return () => {
      if (!account.isActive()) return false;
      account.store.getState().applyCloudSnapshot(merge());
      return true;
    };
  } finally {
    if (file.exists) file.delete();
  }
}
