"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth, type AccountUser } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import { STORE_VERSION, readCloudSnapshot } from "@/lib/store";
import { SyncEngine, type Snapshot, type SyncState } from "@/lib/sync/engine";
import { createSupabaseTransport, reportSyncEvent } from "@/lib/sync/supabase-transport";
import { createBaseStore } from "@/lib/sync/base-store";
import { chronicleStoreAdapter } from "@/lib/sync/store-adapter";
import { deviceLabel } from "@/lib/sync/device";
import { isBlankSnapshot } from "@/lib/sync/integrity";
import { registerBeforeUpdate } from "@/lib/pwa";
import {
  startCoordinator,
  type Coordinator,
  type SyncAction,
  type SyncRole,
} from "@/lib/sync/coordinator";
import { settleLegacyClaim } from "@/lib/account/legacy";
import { releasePushSubscription } from "@/lib/push";
import { forgetRole } from "@/lib/platform/my-role";
import { accountTopic } from "@/lib/platform/live";
import { subscribeLive } from "@/components/platform/live-updates";
import {
  activateAccount,
  clearConflicts,
  deactivateAccount,
  discardSafetyCopies,
  eraseAccountFromDevice,
  keepSafetyCopy,
  markDeviceReady,
  readConflicts,
  recordConflicts,
  reloadFromStorage,
  storeKeyFor,
  type AccountMode,
  type ConflictRecord,
  type StoredAccountMode,
} from "@/lib/account/session";
import { BootScreen } from "./boot-screen";
import { OutdatedScreen, RecoveryScreen, SyncGuard, UnverifiedScreen } from "./sync-safety";

/* ════════════════════════════════════════════════════════════════
   THE SIGNED-IN SESSION
   Mounted once per account (keyed by its id), so switching accounts
   unmounts every page, form and cache of the previous one. It loads the
   account's data into the store, runs cloud sync for it, and owns
   signing out.

   The hydration gate: nothing renders, and nothing can be edited, until
   it is settled which copy is the account's.
     - A copy this browser can prove came from the cloud (its sync stamp)
       opens at once, and keeps working offline.
     - Anything else (a fresh, wiped or unreadable browser) waits for the
       cloud. If the cloud can't be reached, the app says so and offers to
       try again: a failed request is never taken for an empty account.
     - If the cloud can't say which copy is the account's (recovery) or the
       account was saved by a newer app (outdated), a screen says so and
       nothing is written until the student chooses.
   ════════════════════════════════════════════════════════════════ */

export interface SyncView extends SyncState {
  role: SyncRole | "local";
}

/**
 * Who is signed in and what can be done with the session. Stable for the
 * whole session: nothing in it changes when a change is saved, so the app
 * shell and every page that reads it don't re-render on each save.
 */
export interface AccountContextValue {
  accountId: string;
  mode: AccountMode;
  user: AccountUser | null;
  syncNow: () => void;
  /** Carries out a decision about sync (try again, a held save, recovery) in the tab that syncs. */
  act: (action: SyncAction) => void;
  /** Pushes pending changes; true when everything is in the cloud. */
  flush: (timeoutMs?: number) => Promise<boolean>;
  /**
   * Signs out of this device at once: a last save for a moment, then the
   * session ends and the welcome screen opens. Anything the cloud hasn't
   * confirmed stays in this browser, for this account only, and syncs at the
   * next sign-in here.
   */
  signOut: () => Promise<void>;
  /** For account deletion: stop everything and wipe this browser's copy. */
  endAfterDeletion: () => Promise<void>;
  dismissConflicts: () => void;
}

/**
 * The sync status and the edits that clashed between devices. Changes on
 * every save (pending, syncing, synced), so it has a context of its own,
 * read only by what shows it.
 */
export interface SyncStatusValue {
  sync: SyncView;
  conflicts: ConflictRecord[];
}

const AccountContext = createContext<AccountContextValue | null>(null);
const SyncStatusContext = createContext<SyncStatusValue | null>(null);

/**
 * How long signing out waits for a last save before going anyway. On an
 * ordinary connection a save is well inside it; on a slow or broken one the
 * changes stay on this device (they're already saved here) and sync at the
 * next sign-in, rather than holding the student on a waiting screen.
 */
export const SIGN_OUT_SYNC_WAIT_MS = 1_000;
/** How long signing out waits for the browser to forget the last-synced copy. */
const SIGN_OUT_ERASE_WAIT_MS = 400;

/** `promise`'s value, or `fallback` once `ms` have passed. Never rejects. */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export const IDLE: SyncView = {
  status: "idle",
  pending: false,
  lastSyncedAt: null,
  error: null,
  errorKind: null,
  hold: null,
  recovery: null,
  baseVersion: null,
  role: "local",
};

const REMOTE_CHECK_MS = 3 * 60_000;

type Phase = "loading" | "ready" | "unavailable" | "recovery" | "outdated" | "leaving";

export function AccountSession({
  accountId,
  mode,
  user,
  children,
}: {
  accountId: string;
  mode: StoredAccountMode;
  user: AccountUser | null;
  children: React.ReactNode;
}) {
  const auth = useAuth();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [sync, setSync] = useState<SyncView>(IDLE);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const coordinator = useRef<Coordinator | null>(null);

  useEffect(() => {
    let cancelled = false;
    let coord: Coordinator | null = null;
    const cleanups: (() => void)[] = [];
    setPhase("loading");

    void (async () => {
      const activation = await activateAccount(accountId, mode);
      if (cancelled) return;
      setConflicts(readConflicts(accountId));

      // Another tab of this account saved: pick it up, so tabs never diverge.
      const onStorage = (e: StorageEvent) => {
        if (e.key === storeKeyFor(accountId) && e.newValue) reloadFromStorage();
      };
      window.addEventListener("storage", onStorage);
      cleanups.push(() => window.removeEventListener("storage", onStorage));

      if (mode === "local" || !supabase) {
        setSync(IDLE);
        setPhase("ready");
        return;
      }
      const client = supabase;

      // Usable without waiting for the network only when this browser's copy
      // is verified as the account's. Anything else waits for the cloud.
      const canOpenNow = activation.verified;
      if (activation.quarantined) reportSyncEvent(client, "local_quarantined", deviceLabel(), null);

      coord = startCoordinator({
        accountId,
        createEngine: (onState) =>
          new SyncEngine({
            transport: createSupabaseTransport(client, accountId, { schema: STORE_VERSION, device: deviceLabel }),
            store: chronicleStoreAdapter(accountId),
            baseStore: createBaseStore(accountId),
            pristine: activation.pristine,
            trustUnstampedBase: activation.trustUnstampedBase,
            schema: STORE_VERSION,
            legacy: activation.legacy,
            onState,
            onConflicts: (found) => setConflicts(recordConflicts(accountId, found)),
            onRemoteRemoval: (summary, before) =>
              keepSafetyCopy(accountId, { reason: "before_cloud_removal", data: before, summary }),
            onLegacySettled: () => settleLegacyClaim(accountId),
          }),
        onState: (state) => {
          if (cancelled) return;
          setSync((prev) => ({ ...state, role: prev.role }));
          if (state.status === "recovery") {
            setPhase((p) => (p === "leaving" ? p : "recovery"));
          } else if (state.status === "outdated") {
            setPhase((p) => (p === "loading" || p === "unavailable" ? "outdated" : p));
          } else if (state.lastSyncedAt) {
            markDeviceReady(accountId);
            // Out of recovery only once the cloud copy is agreed, not while a
            // choice made on the recovery screen is still being carried out.
            setPhase((p) =>
              p === "loading" || p === "unavailable" || (p === "recovery" && state.status === "synced") ? "ready" : p,
            );
          } else if (state.status === "offline" || state.status === "error") {
            setPhase((p) => {
              if (p !== "loading") return p;
              if (canOpenNow) return "ready";
              reportSyncEvent(client, "hydrate_failed", deviceLabel(), null, { kind: state.errorKind });
              return "unavailable";
            });
          }
        },
        onRole: (role) => {
          if (cancelled) return;
          setSync((prev) => ({ ...prev, role }));
        },
      });
      coordinator.current = coord;
      if (canOpenNow) setPhase("ready");
      // An app update first gives pending changes a moment to reach the cloud.
      cleanups.push(registerBeforeUpdate(() => coord?.flush(2_000) ?? Promise.resolve(false)));

      // The moment another device saves this account, look (a live update; the
      // version says when it's this device's own save). A suspension or deletion
      // made elsewhere ends the session here too, at once rather than within the
      // hour its token has left: the refresh is refused and the app signs out.
      const topic = accountTopic(accountId);
      cleanups.push(subscribeLive(topic, ["chronicle"], (p) => coord?.checkRemote({ version: p.version ?? null })));
      cleanups.push(
        subscribeLive(topic, ["session"], (p) => {
          if (!p.catchUp) void client.auth.refreshSession().catch(() => undefined);
        }),
      );

      // And as before: when the student comes back to the app, comes back
      // online, and every few minutes while it's on screen.
      let focusTimer: ReturnType<typeof setTimeout> | null = null;
      const onFocus = () => {
        if (document.visibilityState !== "visible") return;
        if (focusTimer) clearTimeout(focusTimer);
        focusTimer = setTimeout(() => coord?.checkRemote(), 600);
      };
      const onOnline = () => coord?.syncNow();
      const interval = setInterval(() => {
        if (document.visibilityState === "visible") coord?.checkRemote();
      }, REMOTE_CHECK_MS);
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onFocus);
      window.addEventListener("online", onOnline);
      cleanups.push(() => {
        if (focusTimer) clearTimeout(focusTimer);
        clearInterval(interval);
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onFocus);
        window.removeEventListener("online", onOnline);
      });
    })();

    return () => {
      cancelled = true;
      coord?.stop();
      coordinator.current = null;
      cleanups.forEach((fn) => fn());
      deactivateAccount();
    };
  }, [accountId, mode]);

  const flush = useCallback(
    (timeoutMs = 8_000) =>
      mode === "local"
        ? Promise.resolve(true)
        : (coordinator.current?.flush(timeoutMs) ?? Promise.resolve(false)),
    [mode],
  );

  /**
   * Signing out, in the order that keeps accounts apart and the student
   * moving:
   *
   *   1. At once: the app gives way to "Signing out…", so nothing more can be
   *      edited, and a second press does nothing. The welcome screen is
   *      fetched meanwhile, so it opens the moment the session ends.
   *   2. Everything already edited is in this browser, under this account's
   *      own key (the store writes on every change), whatever the network does.
   *   3. One last save, given SIGN_OUT_SYNC_WAIT_MS. Alongside it, this
   *      device's background notifications are stopped: the request carries
   *      this session's token, so it has to go before the session ends.
   *   4. Sync stops and the account is unloaded: writes off and storage
   *      detached first, then memory cleared (lib/account/session.ts).
   *   5. The session ends on this device (AuthProvider.signOut, bounded too),
   *      and the welcome screen opens.
   *   6. The rest happens in the background: the browser forgets its push
   *      subscription, and this browser's copy of the account goes once the
   *      cloud confirmed it has everything. If it didn't, the copy stays,
   *      for this account only, and syncs at the next sign-in here; the
   *      welcome screen says so.
   */
  const leaving = useRef(false);
  const signOut = useCallback(async () => {
    if (leaving.current) return;
    leaving.current = true;
    setPhase("leaving");
    router.prefetch("/welcome");
    const startedAt = Date.now();
    const push = releasePushSubscription(auth.accessToken());
    const saving = within(flush(SIGN_OUT_SYNC_WAIT_MS), SIGN_OUT_SYNC_WAIT_MS + 100, false);
    // The save and the push request share one wait. The push request is short;
    // if the connection is too slow for it, the browser's own unsubscribe
    // (already under way) still ends this device's notifications.
    const pushed = await saving;
    await within(push.told, Math.max(0, SIGN_OUT_SYNC_WAIT_MS - (Date.now() - startedAt)), undefined);
    // Nothing left to send counts as synced, but only when this tab's own
    // engine can say so: a tab that follows another can't, and keeps its copy.
    const synced = pushed || coordinator.current?.hasUnsyncedChanges() === false;
    // A save that couldn't finish in time says the connection is slow: then the
    // auth server isn't waited on for long either (it finishes in the background).
    const slow = Date.now() - startedAt >= SIGN_OUT_SYNC_WAIT_MS;
    coordinator.current?.stop();
    coordinator.current = null;
    deactivateAccount();
    // The remembered Admin Center role goes either way; unsynced data stays.
    forgetRole(accountId);
    if (synced) await within(eraseAccountFromDevice(accountId), SIGN_OUT_ERASE_WAIT_MS, undefined);
    await auth.signOut({ landing: synced ? "/welcome" : "/welcome?unsynced=1", waitMs: slow ? 300 : undefined });
  }, [accountId, auth, flush, router]);

  const endAfterDeletion = useCallback(async () => {
    leaving.current = true;
    setPhase("leaving");
    coordinator.current?.stop();
    coordinator.current = null;
    deactivateAccount();
    await eraseAccountFromDevice(accountId);
    discardSafetyCopies(accountId);
    await auth.signOut();
  }, [accountId, auth]);

  const dismissConflicts = useCallback(() => {
    clearConflicts(accountId);
    setConflicts([]);
  }, [accountId]);
  const syncNow = useCallback(() => coordinator.current?.syncNow(), []);
  const act = useCallback((action: SyncAction) => coordinator.current?.act(action), []);

  const value = useMemo<AccountContextValue>(
    () => ({ accountId, mode, user, syncNow, act, flush, signOut, endAfterDeletion, dismissConflicts }),
    [accountId, mode, user, syncNow, act, flush, signOut, endAfterDeletion, dismissConflicts],
  );
  const status = useMemo<SyncStatusValue>(() => ({ sync, conflicts }), [sync, conflicts]);

  if (phase === "leaving") return <BootScreen label="Signing out…" />;
  if (phase === "loading") return <BootScreen label="Loading your chronicle…" />;
  if (phase === "unavailable") {
    return (
      <UnverifiedScreen
        error={sync.error}
        onRetry={() => act({ kind: "retry" })}
        onSignOut={mode === "cloud" ? () => void auth.signOut() : undefined}
      />
    );
  }
  if (phase === "outdated") return <OutdatedScreen />;

  return (
    <AccountContext.Provider value={value}>
      <SyncStatusContext.Provider value={status}>
        {phase === "recovery" ? (
          <RecoveryScreen
            reason={sync.recovery ?? "unrecognised"}
            error={sync.error}
            deviceHasData={!isBlankSnapshot(readCloudSnapshot() as unknown as Snapshot)}
            onRetry={() => act({ kind: "retry" })}
            onInitialise={(intent) => act({ kind: "initialise", intent })}
            onSignOut={() => void signOut()}
          />
        ) : (
          <>
            {children}
            <SyncGuard />
          </>
        )}
      </SyncStatusContext.Provider>
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used within an AccountSession");
  return ctx;
}

/** The sync status and recorded clashes. Re-renders on every save: read it only where it's shown. */
export function useSyncStatus(): SyncStatusValue {
  const ctx = useContext(SyncStatusContext);
  if (!ctx) throw new Error("useSyncStatus must be used within an AccountSession");
  return ctx;
}

/**
 * An account context with no account behind it, for the interactive demo
 * (components/demo/demo-session.tsx): the pages read it exactly as they read
 * a real one, and nothing in it can sync, save or sign anyone out.
 */
export function StaticAccountProvider({
  value,
  status,
  children,
}: {
  value: AccountContextValue;
  status: SyncStatusValue;
  children: React.ReactNode;
}) {
  return (
    <AccountContext.Provider value={value}>
      <SyncStatusContext.Provider value={status}>{children}</SyncStatusContext.Provider>
    </AccountContext.Provider>
  );
}
