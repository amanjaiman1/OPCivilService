import { openDatabaseAsync } from "expo-sqlite";
import { randomUUID } from "expo-crypto";
import type { BaseStore } from "../../../src/lib/sync/engine";
import { databaseKey } from "./credentials";

async function open() {
  const key = await databaseKey();
  const db = await openDatabaseAsync("doordie-private-v1.db");
  try {
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    const cipher = await db.getFirstAsync<{ cipher_version: string }>("PRAGMA cipher_version");
    if (!cipher?.cipher_version) throw new Error("This build does not support encrypted offline storage");
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS local_state (
        account TEXT NOT NULL, slot TEXT NOT NULL, value TEXT NOT NULL,
        PRIMARY KEY (account, slot)
      );
    `);
    return db;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}

let opening: ReturnType<typeof open> | undefined;
function getDatabase() {
  opening ??= open().catch((error) => {
    opening = undefined;
    throw error;
  });
  return opening;
}

export async function accountDisk(account: string) {
  const db = await getDatabase();
  const get = (slot: string) => db.getFirstSync<{ value: string }>(
    "SELECT value FROM local_state WHERE account = ? AND slot = ?", account, slot
  )?.value ?? null;
  const set = (slot: string, value: string) => db.runSync(
    "INSERT INTO local_state VALUES (?, ?, ?) ON CONFLICT(account, slot) DO UPDATE SET value = excluded.value",
    account, slot, value
  );
  const remove = (slot: string) => db.runSync("DELETE FROM local_state WHERE account = ? AND slot = ?", account, slot);
  const storage = {
    getItem: get,
    setItem(slot: string, value: string) { set(slot, value); },
    removeItem(slot: string) { remove(slot); },
  };
  const baseStore: BaseStore = {
    async load() {
      const value = get("base");
      return value && JSON.parse(value);
    },
    async save(base) { set("base", JSON.stringify(base)); },
  };
  let device = get("device");
  if (!device) {
    device = randomUUID();
    set("device", device);
  }
  return {
    storage, baseStore, device,
    hasSnapshot: !!get("snapshot"),
    getRole: () => get("role"),
    readDraft: (date: string) => get(`study-draft:${date}`),
    writeDraft(date: string, raw: string | null) {
      const slot = `study-draft:${date}`;
      if (!raw) { remove(slot); return; }
      if (!get(slot)) {
        const count = db.getFirstSync<{ total: number }>(
          "SELECT count(*) AS total FROM local_state WHERE account = ? AND slot LIKE 'study-draft:%'", account
        )?.total ?? 0;
        if (count >= 30) throw new Error("Resolve a saved Capture draft before starting another");
      }
      set(slot, raw);
    },
    pushState: () => get("push"),
    setPushState(state: "pending" | "enabled" | null) { if (state) set("push", state); else remove("push"); },
    setRole(role: string) { set("role", role); },
    preserve(snapshot: unknown) { set("recovery", JSON.stringify(snapshot)); },
    readRecovery: () => get("recovery"),
    saveConflicts(conflicts: unknown) { set("conflicts", JSON.stringify(conflicts)); },
    clear() { db.runSync("DELETE FROM local_state WHERE account = ?", account); },
  };
}
