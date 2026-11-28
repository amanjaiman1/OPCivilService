"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { useAccount, useSyncStatus } from "@/components/account/account-session";
import { hasOpenOverlay } from "@/components/ui/modal";
import { walkthroughForPath, walkthroughMeta } from "@/lib/walkthroughs/catalog";
import { loadWalkthrough } from "@/lib/walkthroughs/registry";
import {
  advanceWalkthrough,
  finishWalkthrough,
  openWalkthrough,
  replayWalkthrough,
  resumeStep,
  shouldAutoOpen,
  walkthroughState,
  type WalkthroughIdentity,
} from "@/lib/walkthroughs/progress";
import type { WalkthroughExperience, WalkthroughId, WalkthroughMeta } from "@/lib/walkthroughs/types";
import { WalkthroughContext, type WalkthroughContextValue } from "./walkthrough-context";
import { WalkthroughPlayer } from "./walkthrough-player";

/* ════════════════════════════════════════════════════════════════
   THE PLAYER'S OTHER HALF
   Decides when a surface's walkthrough opens by itself, loads its authored
   film only when it is about to play, and writes every step reached to the
   synced snapshot — so a walkthrough closed on the phone resumes on the
   laptop. The experience modules are downloaded lazily; nothing here draws.
   ════════════════════════════════════════════════════════════════ */

/** How long the page is on screen before its walkthrough rises over it. */
const AUTO_OPEN_DELAY_MS = 850;

interface Session {
  experience: WalkthroughExperience;
  step: number;
  completed: boolean;
  /** Where it was opened from, so a route change can close it. */
  openedOn: string;
}

function identityOf(meta: WalkthroughMeta): WalkthroughIdentity {
  return { id: meta.id, version: meta.version, stepCount: meta.steps };
}

function nowISO(): string {
  return new Date().toISOString();
}

export function WalkthroughProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hydrated = useHasHydrated();
  const { mode } = useAccount();
  const { sync } = useSyncStatus();
  const progress = useChronicle((s) => s.walkthroughs);

  const current = useMemo(() => walkthroughForPath(pathname) ?? null, [pathname]);
  const currentState = current ? walkthroughState(progress?.[current.id], identityOf(current)) : "new";

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const autoTried = useRef<string | null>(null);

  /**
   * Settled once a sync has finished this visit, or once it is clear none can:
   * a walkthrough finished on another device arrives with that first sync, and
   * opening it before then would show it twice.
   */
  const synced =
    mode !== "cloud" ||
    sync.lastSyncedAt !== null ||
    sync.status === "offline" ||
    sync.status === "error";

  const write = useCallback((next: ReturnType<typeof openWalkthrough>) => {
    const save = useChronicle.getState().saveWalkthroughProgress;
    save(next);
  }, []);

  /** Loads and opens one experience. `fresh` starts over, whatever the record. */
  const start = useCallback(async (id: WalkthroughId, fresh: boolean) => {
    const meta = walkthroughMeta(id);
    if (!meta || loading) return;
    setLoading(true);
    const experience = await loadWalkthrough(id);
    setLoading(false);
    if (!experience) return;

    const identity = identityOf(meta);
    const map = useChronicle.getState().walkthroughs ?? {};
    if (fresh) {
      write(replayWalkthrough(map, identity, nowISO()));
      setSession({ experience, step: 0, completed: false, openedOn: id === "capture" ? "capture" : window.location.pathname });
      return;
    }

    const step = resumeStep(map[id], identity);
    // Opening is written straight away: it is what stops the same walkthrough
    // opening by itself again, even if the tab is closed mid-step.
    if (walkthroughState(map[id], identity) !== "in-progress") {
      write(openWalkthrough(map, identity, nowISO()));
    }
    setSession({
      experience,
      step,
      completed: false,
      openedOn: id === "capture" ? "capture" : window.location.pathname,
    });
  }, [loading, write]);

  const open = useCallback((id?: WalkthroughId) => {
    const target = id ?? current?.id;
    if (target) void start(target, false);
  }, [current, start]);

  const replay = useCallback((id?: WalkthroughId) => {
    const target = id ?? current?.id;
    if (target) void start(target, true);
  }, [current, start]);

  const close = useCallback(() => {
    setSession(null);
  }, []);

  const prepare = useCallback((id?: WalkthroughId) => {
    const target = id ?? current?.id;
    if (target) void loadWalkthrough(target);
  }, [current]);

  const goTo = useCallback((step: number) => {
    setSession((active) => {
      if (!active) return active;
      const clamped = Math.max(0, Math.min(step, active.experience.steps.length - 1));
      const map = useChronicle.getState().walkthroughs ?? {};
      write(advanceWalkthrough(map, {
        id: active.experience.id,
        version: active.experience.version,
        stepCount: active.experience.steps.length,
      }, clamped, nowISO()));
      return { ...active, step: clamped };
    });
  }, [write]);

  const finish = useCallback(() => {
    setSession((active) => {
      if (!active) return active;
      const map = useChronicle.getState().walkthroughs ?? {};
      write(finishWalkthrough(map, {
        id: active.experience.id,
        version: active.experience.version,
        stepCount: active.experience.steps.length,
      }, nowISO()));
      return { ...active, completed: true };
    });
  }, [write]);

  /** The current route's walkthrough, only when the catalog has one. */
  const autoEligible =
    hydrated &&
    synced &&
    Boolean(current) &&
    !session &&
    !loading &&
    !hasOpenOverlay() &&
    shouldAutoOpen(progress ?? {}, identityOf(current as WalkthroughMeta), { ready: hydrated && synced, blocked: false });

  // A first visit shows the page, then the walkthrough. Leaving the route
  // inside that moment calls it off — and the control above notices.
  useEffect(() => {
    if (!autoEligible || !current) return;
    const key = `${current.id}@${current.version}`;
    if (autoTried.current === key) return;
    const timer = window.setTimeout(() => {
      autoTried.current = key;
      void start(current.id, false);
    }, AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoEligible, current, start]);

  // Navigating away closes it: it explains the page it opened over.
  useEffect(() => {
    setSession((active) => {
      if (!active) return active;
      if (active.experience.id === "capture") return active;
      const onRoute = active.experience.path === pathname ||
        (walkthroughMeta(active.experience.id)?.aliases ?? []).some((alias) => pathname.startsWith(alias));
      return onRoute ? active : null;
    });
  }, [pathname]);

  // A capture walkthrough has no route; once the popup is gone it goes too.
  useEffect(() => {
    if (!session || session.experience.id !== "capture") return;
    if (session.completed) return;
    const check = () => {
      if (!document.querySelector(".capture-dialog") && !hasOpenOverlay()) {
        setSession((active) => (active?.experience.id === "capture" ? null : active));
      }
    };
    const id = window.setInterval(check, 700);
    return () => window.clearInterval(id);
  }, [session]);

  const openCapture = useCallback(() => {
    void start("capture", false);
  }, [start]);

  const value = useMemo<WalkthroughContextValue>(
    () => ({
      open,
      replay,
      close,
      prepare,
      isOpen: session !== null,
      current,
      state: currentState,
      openCapture,
    }),
    [open, replay, close, prepare, session, current, currentState, openCapture],
  );

  return (
    <WalkthroughContext.Provider value={value}>
      {children}
      {session && (
        <WalkthroughPlayer
          experience={session.experience}
          step={session.step}
          completed={session.completed}
          onStep={goTo}
          onFinish={finish}
          onClose={close}
          onReplay={() => replay(session.experience.id)}
        />
      )}
    </WalkthroughContext.Provider>
  );
}
