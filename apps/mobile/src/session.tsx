import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Linking } from "react-native";
import * as Network from "expo-network";
import type { Session } from "@supabase/supabase-js";
import { useStore } from "zustand";
import type { SyncState } from "../../../src/lib/sync/engine";
import { openAccount, type NativeAccount } from "./account";
import { authCallback, authClient } from "./cloud";
import { callbackCode } from "./links";
import { accountTopic, LIVE_EVENT, liveAreasOf, liveVersionOf, PLATFORM_TOPIC } from "../../../src/lib/platform/live";
import type { MyAnnouncements } from "../../../src/lib/platform/types";

type SessionContext = {
  session: Session | null;
  loading: boolean;
  account: NativeAccount | null;
  sync: SyncState | null;
  storageError: boolean;
  webAdmin: boolean;
  hasConflicts: boolean;
  liveVersion: number;
  attention: { announcements: number; feedback: number } | null;
  restartAccount: () => void;
  recovery: boolean;
  linkMessage: string;
  finishRecovery: () => void;
  signOut: (keepLocal?: boolean) => Promise<boolean>;
  removeLocalAccount: () => Promise<void>;
};

const Context = createContext<SessionContext | null>(null);

export function Sessions({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!authClient);
  const [stored, setStored] = useState<NativeAccount | null>(null);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [webAdmin, setWebAdmin] = useState(false);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [liveVersion, setLiveVersion] = useState(0);
  const [attention, setAttention] = useState<{ id: string; announcements: number; feedback: number }>();
  const [linkMessage, setLinkMessage] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const activeId = useRef<string | null>(null);
  const exchange = useRef<{ pending: boolean; consumed?: string }>({ pending: false });
  const account = stored?.id === session?.user.id ? stored : null;

  useEffect(() => {
    const client = authClient;
    if (!client) return;
    let mounted = true;
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      activeId.current = next?.user.id ?? null;
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);
      setLoading(false);
    });
    async function accept(url: string) {
      const code = authCallback && callbackCode(url, authCallback);
      if (!code || exchange.current.pending || exchange.current.consumed === code) return;
      exchange.current.pending = true;
      try {
        const result = await client!.auth.exchangeCodeForSession(code);
        if (result.error) throw result.error;
        exchange.current.consumed = code;
        if (mounted) {
          setLinkMessage("");
        }
      } catch {
        if (mounted) setLinkMessage("This link could not be used. Request a fresh link on this device.");
      } finally {
        exchange.current.pending = false;
      }
    }
    void Linking.getInitialURL().then((url) => { if (mounted && url) void accept(url); });
    const links = Linking.addEventListener("url", ({ url }) => void accept(url));
    const refresh = (state: string) => {
      if (state === "active") void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    };
    refresh(AppState.currentState ?? "inactive");
    const lifecycle = AppState.addEventListener("change", refresh);
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
      links.remove();
      lifecycle.remove();
      void client.auth.stopAutoRefresh();
    };
  }, []);

  const accountId = session?.user.id;
  useEffect(() => {
    if (!accountId || recovery) return;
    let opened: NativeAccount | null = null;
    let alive = true;
    let started = false;
    const isActive = () => alive && activeId.current === accountId;
    const onStorageError = () => { if (isActive()) setStorageError(true); };
    setStorageError(false);
    setWebAdmin(false);
    setHasConflicts(false);
    setSync(null);
    setStored(null);
    void openAccount(accountId, isActive, (state) => { if (isActive()) setSync(state); }, onStorageError, () => { if (isActive()) setHasConflicts(true); })
      .then(async (next) => {
        if (!isActive()) return;
        opened = next;
        const role = await next.readRole();
        if (!isActive()) return;
        if (role === "super_admin") { setWebAdmin(true); return; }
        setStored(next);
        try { await next.engine.start(); }
        finally { started = true; }
      })
      .catch(onStorageError);
    const lifecycle = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !opened || !started || !isActive()) return;
      const current = opened;
      void current.readRole().then((role) => {
        if (!isActive()) return;
        if (role === "super_admin") { current.engine.stop(); setStored(null); setWebAdmin(true); }
        else void current.engine.sync();
      });
    });
    const connectivity = Network.addNetworkStateListener(({ isConnected }) => {
      if (isConnected && AppState.currentState === "active" && started && opened && isActive()) void opened.engine.sync();
    });
    return () => {
      alive = false;
      opened?.engine.stop();
      lifecycle.remove();
      connectivity.remove();
    };
  }, [accountId, recovery, attempt]);

  useEffect(() => {
    if (!account || recovery) return;
    const { client, engine } = account;
    let alive = true;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function invalidate() {
      if (!alive || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (!alive || !account?.isActive()) return;
        setLiveVersion((version) => version + 1);
        const request = ++generation;
        void Promise.resolve(client.rpc("platform_my_announcements")).then(({ data, error }) => {
          if (error || !alive || !account.isActive() || request !== generation || !data) return;
          const inbox = data as MyAnnouncements;
          setAttention({ id: account.id, announcements: (inbox.items ?? []).filter((item) => item.active && !item.readAt && !item.dismissedAt).length,
            feedback: inbox.unseenResponses ?? 0 });
        }).catch(() => undefined);
      }, 200);
    }
    const channels = [PLATFORM_TOPIC, accountTopic(account.id)].map((name) => client.channel(name, { config: { private: true } })
      .on("broadcast", { event: LIVE_EVENT }, ({ payload }) => {
        if (!alive || !account.isActive()) return;
        const areas = liveAreasOf(payload);
        if (areas.includes("chronicle")) void engine.checkRemote({ version: liveVersionOf(payload) });
        if (areas.some((area) => area === "announcements" || area === "notice" || area === "feedback" || area === "reviews")) invalidate();
      }).subscribe((status) => { if (status === "SUBSCRIBED") invalidate(); }));
    const foreground = AppState.addEventListener("change", (state) => { if (state === "active") invalidate(); });
    invalidate();
    return () => {
      alive = false;
      clearTimeout(timer);
      foreground.remove();
      for (const channel of channels) void client.removeChannel(channel);
    };
  }, [account, recovery]);

  async function signOut(keepLocal = false) {
    if (!authClient) return false;
    if (!keepLocal && account && (account.engine.hasUnsyncedChanges() || sync?.pending) && !(await account.engine.flush())) {
      return false;
    }
    if (account && !(await account.push.revoke(true))) return false;
    const result = await authClient.auth.signOut({ scope: "local" });
    if (result.error) return false;
    if (account) {
      account.engine.stop();
      if (!keepLocal) account.clear();
    }
    return true;
  }

  async function removeLocalAccount() {
    if (!account?.isActive() || !authClient) return;
    account.engine.stop();
    activeId.current = null;
    setSession(null);
    setStored(null);
    try { account.clear(); }
    finally { await authClient.auth.signOut({ scope: "local" }); }
  }

  return <Context.Provider value={{
    session, loading, account, sync, storageError, webAdmin, hasConflicts, liveVersion,
    attention: attention?.id === account?.id ? attention ?? null : null, restartAccount: () => setAttempt((n) => n + 1),
    recovery, linkMessage, finishRecovery: () => setRecovery(false), signOut, removeLocalAccount,
  }}>{children}</Context.Provider>;
}

export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing session provider");
  return value;
}

export function useAccount() {
  const { account } = useSession();
  if (!account) throw new Error("Missing active account");
  return account;
}

export function useChronicle<T>(selector: (state: ReturnType<NativeAccount["store"]["getState"]>) => T): T {
  return useStore(useAccount().store, selector);
}
