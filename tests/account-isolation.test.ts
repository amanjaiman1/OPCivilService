import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "./memory-storage";
import {
  accountStorage,
  eraseAccountKeys,
  setActiveAccount,
  enableWrites,
  setStorageBackend,
  withoutWrites,
} from "@/lib/account/scope";
import { claimLegacyData, settleLegacyClaim } from "@/lib/account/legacy";
import { activateAccount, deactivateAccount } from "@/lib/account/session";
import { useChronicle } from "@/lib/store";
import { defaultSetup } from "@/lib/seed";

let disk: MemoryStorage;
beforeEach(() => {
  disk = new MemoryStorage();
  setStorageBackend(disk as unknown as Storage);
  setActiveAccount(null);
});

test("with no active account, nothing can be read or written", () => {
  accountStorage.setItem("upsc-chronicle-store", "{}");
  assert.equal(disk.length, 0);
  assert.equal(accountStorage.getItem("upsc-chronicle-store"), null);
});

test("each account reads and writes only its own key", () => {
  setActiveAccount("alice");
  enableWrites();
  accountStorage.setItem("upsc-chronicle-store", "alice-data");
  setActiveAccount("bob");
  assert.equal(accountStorage.getItem("upsc-chronicle-store"), null, "bob can't see alice's data");
  enableWrites();
  accountStorage.setItem("upsc-chronicle-store", "bob-data");
  assert.equal(disk.getItem("upsc-chronicle-store:alice"), "alice-data");
  assert.equal(disk.getItem("upsc-chronicle-store:bob"), "bob-data");
});

test("switching accounts turns writes off until the new account is ready", () => {
  setActiveAccount("alice");
  enableWrites();
  setActiveAccount("bob"); // writes off again
  accountStorage.setItem("upsc-chronicle-store", "would-be-a-leak");
  assert.equal(disk.getItem("upsc-chronicle-store:bob"), null);
  enableWrites();
  withoutWrites(() => accountStorage.setItem("upsc-chronicle-store", "echo"));
  assert.equal(disk.getItem("upsc-chronicle-store:bob"), null, "re-reads from another tab never write back");
});

test("erasing an account removes its keys and nobody else's", () => {
  disk.setItem("upsc-chronicle-store:alice", "a");
  disk.setItem("upsc-chronicle-surface:alice", "black");
  disk.setItem("upsc-chronicle-store:bob", "b");
  eraseAccountKeys("alice");
  assert.deepEqual(disk.keys(), ["upsc-chronicle-store:bob"]);
});

const LEGACY = JSON.stringify({ state: { profile: { name: "Owner" }, journal: [{ date: "2026-11-01" }] }, version: 9 });

test("pre-account data goes only to the account that last synced it from this browser", () => {
  disk.setItem("upsc-chronicle-store", LEGACY);
  disk.setItem("upsc-chronicle-cloud-synced:owner", "2026-11-14T08:00:00.000Z");
  disk.setItem("upsc-chronicle-cloud-synced:friend", "2026-10-01T08:00:00.000Z");

  assert.equal(claimLegacyData("newcomer", "cloud"), null, "a new account gets nothing");
  assert.equal(claimLegacyData("friend", "cloud"), null, "nor an older one");
  assert.equal(disk.getItem("upsc-chronicle-store:newcomer"), null);

  const claim = claimLegacyData("owner", "cloud");
  assert.deepEqual(claim, { syncedAt: "2026-11-14T08:00:00.000Z" });
  assert.equal(disk.getItem("upsc-chronicle-store:owner"), LEGACY);
  assert.equal(disk.getItem("upsc-chronicle-store"), LEGACY, "the original stays until a sync confirms the move");

  assert.deepEqual(claimLegacyData("owner", "cloud"), claim, "a retry resumes the same claim");
  settleLegacyClaim("owner");
  assert.equal(disk.getItem("upsc-chronicle-store"), null);
  assert.equal(disk.getItem("upsc-chronicle-cloud-synced:friend"), null);
  assert.equal(claimLegacyData("friend", "cloud"), null);
});

test("data from before accounts with no sync marker is never handed out", () => {
  disk.setItem("upsc-chronicle-store", LEGACY);
  assert.equal(claimLegacyData("anyone", "cloud"), null);
  assert.equal(disk.getItem("upsc-chronicle-store"), LEGACY, "left untouched for manual recovery");
});

type Entry = { date: string; totalHours: number };
const entry = (date: string, hours: number) => ({ ...useChronicle.getState().journal[0], id: date, date, totalHours: hours, blocks: [], mood: 3, energy: 3, motivation: 3, focus: 3 });

test("two accounts on one browser never see each other's data, in memory or on disk", async () => {
  await activateAccount("alice", "cloud");
  useChronicle.getState().completeOnboarding({ ...defaultSetup(), name: "Alice" });
  useChronicle.getState().upsertJournal(entry("2026-11-10", 6));
  deactivateAccount();

  // Signed out: the in-memory store is blank.
  assert.equal(useChronicle.getState().journal.length, 0);
  assert.equal(useChronicle.getState().profile.name, "");

  await activateAccount("bob", "cloud");
  assert.equal(useChronicle.getState().journal.length, 0, "bob starts clean");
  assert.equal(useChronicle.getState().profile.onboardedAt, undefined, "and is sent to setup");
  useChronicle.getState().completeOnboarding({ ...defaultSetup(), name: "Bob" });
  useChronicle.getState().upsertJournal(entry("2026-11-11", 3));
  deactivateAccount();

  await activateAccount("alice", "cloud");
  const alice = useChronicle.getState();
  assert.equal(alice.profile.name, "Alice");
  assert.deepEqual(alice.journal.map((e: Entry) => e.date), ["2026-11-10"], "alice sees only her own day");

  const onDisk = disk.getItem("upsc-chronicle-store:bob") ?? "";
  assert.ok(onDisk.includes("2026-11-11") && !onDisk.includes("2026-11-10"), "bob's saved copy holds only bob's day");
  deactivateAccount();
});

/* ── how far a browser's copy is trusted when an account opens ── */

import { readSafetyCopies } from "@/lib/account/session";
import { chronicleStoreAdapter } from "@/lib/sync/store-adapter";

const stampAs = (accountId: string, version: number) =>
  useChronicle.getState().applyCloudSnapshot(null, { accountId, version, at: "2026-11-21T07:00:00Z" });

test("a fresh browser's copy is pristine and unverified: it must wait for the cloud", async () => {
  const a = await activateAccount("alice", "cloud");
  assert.equal(a.pristine, true);
  assert.equal(a.verified, false);
  deactivateAccount();
});

test("a copy stamped by a sync opens verified, before the network answers", async () => {
  await activateAccount("alice", "cloud");
  useChronicle.getState().completeOnboarding({ ...defaultSetup(), name: "Alice" });
  stampAs("alice", 12);
  deactivateAccount();
  const again = await activateAccount("alice", "cloud");
  assert.equal(again.verified, true);
  assert.equal(again.pristine, false);
  assert.equal(chronicleStoreAdapter("alice").readStamp(), 12);
  deactivateAccount();
});

test("the stamp lives in the same entry as the data: wiping one wipes the other", async () => {
  await activateAccount("alice", "cloud");
  useChronicle.getState().completeOnboarding({ ...defaultSetup(), name: "Alice" });
  stampAs("alice", 12);
  deactivateAccount();
  assert.ok((disk.getItem("upsc-chronicle-store:alice") ?? "").includes('"_sync"'));
  disk.removeItem("upsc-chronicle-store:alice"); // site data cleared
  const after = await activateAccount("alice", "cloud");
  assert.equal(after.verified, false, "nothing on the device can vouch for itself any more");
  assert.equal(after.pristine, true);
  deactivateAccount();
});

test("an unreadable stored copy is set aside, never overwritten, and the account waits for the cloud", async () => {
  disk.setItem("upsc-chronicle-store:alice", "{not json");
  const a = await activateAccount("alice", "cloud");
  assert.equal(a.quarantined, true);
  assert.equal(a.verified, false);
  assert.equal(readSafetyCopies("alice")[0]?.raw, "{not json", "the damaged copy is kept");
  assert.equal(disk.getItem("upsc-chronicle-store:alice"), "{not json", "and not written over by the blank");
  assert.equal(useChronicle.getState()._hasHydrated, true, "pages still render, once the cloud copy arrives");
  deactivateAccount();
});

test("a copy carrying another account's stamp is set aside and never used", async () => {
  await activateAccount("alice", "cloud");
  useChronicle.getState().completeOnboarding({ ...defaultSetup(), name: "Alice" });
  useChronicle.getState().upsertJournal(entry("2026-11-10", 6));
  stampAs("alice", 4);
  deactivateAccount();
  disk.setItem("upsc-chronicle-store:bob", disk.getItem("upsc-chronicle-store:alice") as string);

  const b = await activateAccount("bob", "cloud");
  assert.equal(b.quarantined, true);
  assert.equal(b.verified, false);
  assert.equal(useChronicle.getState().journal.length, 0, "none of alice's data is loaded for bob");
  assert.equal(chronicleStoreAdapter("bob").readStamp(), null);
  deactivateAccount();
});

test("a device from before stamps, with its storage intact, still opens at once", async () => {
  await activateAccount("alice", "cloud");
  useChronicle.getState().completeOnboarding({ ...defaultSetup(), name: "Alice" });
  deactivateAccount();
  disk.setItem("upsc-chronicle-ready:alice", "1");
  const a = await activateAccount("alice", "cloud");
  assert.equal(a.trustUnstampedBase, true);
  assert.equal(a.verified, true);
  deactivateAccount();
});

test("H: an account's unsynced changes stay with that account across a switch", async () => {
  await activateAccount("alice", "cloud");
  useChronicle.getState().completeOnboarding({ ...defaultSetup(), name: "Alice" });
  stampAs("alice", 3);
  useChronicle.getState().upsertJournal(entry("2026-11-12", 2)); // not yet synced
  deactivateAccount();

  await activateAccount("bob", "cloud");
  assert.equal(chronicleStoreAdapter("bob").readStamp(), null, "bob has no synced copy of his own");
  assert.equal(useChronicle.getState().journal.length, 0, "and none of alice's pending day");
  deactivateAccount();

  await activateAccount("alice", "cloud");
  assert.deepEqual(useChronicle.getState().journal.map((e: Entry) => e.date), ["2026-11-12"], "alice's pending day waited for her");
  assert.equal(chronicleStoreAdapter("alice").readStamp(), 3);
  deactivateAccount();
});
