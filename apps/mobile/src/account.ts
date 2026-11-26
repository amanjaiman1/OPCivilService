import { createChronicleStore, STORE_VERSION } from "../../../src/lib/chronicle-store";
import { SyncEngine, SyncError, type SyncState } from "../../../src/lib/sync/engine";
import { snapshotStoreAdapter } from "../../../src/lib/sync/snapshot-store";
import { createSupabaseTransport } from "../../../src/lib/sync/supabase-transport";
import { authClient, scopedClient } from "./cloud";
import { accountDisk } from "./offline";
import { isPlatformRole } from "../../../src/lib/platform/roles";

export async function openAccount(accountId: string, isActive: () => boolean, onState: (state: SyncState) => void, onStorageError: () => void, onConflict: () => void) {
  const disk = await accountDisk(accountId);
  let failed = false;
  const persist = createChronicleStore({
    key: "snapshot",
    storage: {
      ...disk.storage,
      setItem(key, value) {
        try {
          const result = disk.storage.setItem(key, value);
          return result;
        } catch (error) {
          failed = true;
          onStorageError();
          throw error;
        }
      },
    },
  });
  await persist.persist.rehydrate();
  if (persist.lastHydrationFailed() || failed) throw new Error("The offline copy could not be opened");
  const stamp = persist.getState()._sync;
  if (stamp && (stamp.accountId !== accountId || !Number.isInteger(stamp.version) || stamp.version <= 0)) {
    throw new Error("The offline copy cannot be verified for this account");
  }
  if (!isActive()) throw new SyncError("The active account changed", "stopped");

  const session = async () => {
    const result = await authClient?.auth.getSession();
    const active = result?.data.session;
    if (!isActive() || active?.user.id !== accountId) throw new SyncError("The account session is unavailable", "auth");
    return active;
  };
  // This client can only obtain a bearer token for the account that owns its disk and sync engine.
  const client = scopedClient(async () => (await session()).access_token);
  const local = snapshotStoreAdapter(accountId, persist);
  async function readRole() {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 3500);
    try {
      const result = await client.rpc("platform_my_role").abortSignal(abort.signal);
      if (!result.error && isActive()) {
        const role = (result.data as { role?: unknown } | null)?.role;
        const normalized = isPlatformRole(role) ? role : "student";
        disk.setRole(normalized);
        return normalized;
      }
    } catch {
      // Only this account's previously verified role is usable offline.
    } finally { clearTimeout(timer); }
    return disk.getRole();
  }
  const engine = new SyncEngine({
    store: {
      ...local,
      read() {
        if (failed) throw new SyncError("The device could not save the offline copy", "server");
        return local.read();
      },
    },
    transport: createSupabaseTransport(client, accountId, {
      device: () => `Native ${disk.device}`,
      schema: STORE_VERSION,
      accountSession: async () => (await session()).user.id,
    }),
    baseStore: disk.baseStore,
    pristine: !disk.hasSnapshot,
    schema: STORE_VERSION,
    onState,
    onRemoteRemoval: (_summary, before) => disk.preserve(before),
    onConflicts(conflicts) { disk.saveConflicts(conflicts); onConflict(); },
  });
  let pushQueue: Promise<unknown> = Promise.resolve();
  let ending = false;
  const queuePush = (job: () => Promise<boolean>) => {
    const next = pushQueue.then(job);
    pushQueue = next.catch(() => undefined);
    return next;
  };
  const push = {
    device: disk.device,
    enabled: () => disk.pushState() === "enabled",
    optedIn: () => disk.pushState() != null,
    register(token: string, platform: "android" | "ios", timezone: string) {
      return queuePush(async () => {
        if (!isActive() || ending) return false;
        // Record intent before calling the server, so interrupted opt-in still
        // requires a revocation before this installation can switch accounts.
        if (!disk.pushState()) disk.setPushState("pending");
        const result = await client.rpc("chronicle_register_native_push", {
          p_device: disk.device, p_token: token, p_platform: platform, p_timezone: timezone,
        });
        if (result.error || result.data !== true || !isActive()) return false;
        disk.setPushState("enabled");
        return true;
      });
    },
    async revoke(forSignOut = false) {
      if (forSignOut) ending = true;
      try {
        const ok = await queuePush(async () => {
          if (!disk.pushState()) return true;
          const result = await client.rpc("chronicle_revoke_native_push", { p_device: disk.device });
          if (result.error || result.data !== true) return false;
          disk.setPushState(null);
          return true;
        });
        if (!ok) ending = false;
        return ok;
      } catch (error) {
        ending = false;
        throw error;
      }
    },
  };
  return { id: accountId, store: persist, engine, client, isActive, readRole, push, readRecovery: disk.readRecovery, readDraft: disk.readDraft, writeDraft: disk.writeDraft, clear: disk.clear, cached: disk.hasSnapshot };
}

export type NativeAccount = Awaited<ReturnType<typeof openAccount>>;
