"use client";

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useFeatureAccess } from "@/components/features/feature-access";
import { useHasHydrated } from "@/lib/store";
import { canAccessFeature } from "@/lib/features";
import { captureLink, withoutCaptureParams, type CaptureTarget } from "@/lib/capture-routing";
import { toISODate } from "@/lib/utils";
import { hasOpenOverlay } from "@/components/ui/modal";
import { useTour } from "@/components/tour/tour-context";

const loadCapture = () => import("./capture-workspace");
const Workspace = lazy(() => loadCapture().then((module) => ({ default: module.CaptureWorkspace })));
const STATE_KEY = "doordieCapture";

interface ActiveCapture {
  target: CaptureTarget;
  pathname: string;
  historyKey?: string;
  opener: HTMLElement | null;
}

const CaptureContext = createContext<{
  available: boolean;
  opened: boolean;
  open: (target?: CaptureTarget, nested?: boolean) => void;
  prepare: () => void;
} | null>(null);

export function useCapture() {
  const context = useContext(CaptureContext);
  if (!context) throw new Error("Capture requires CaptureProvider");
  return context;
}

function CaptureDeepLink({ onOpen }: { onOpen: (target: CaptureTarget) => void }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    const url = new URL(window.location.href);
    const target = captureLink(pathname, url.searchParams, toISODate(new Date()));
    if (!target) return;
    onOpen(target);
  }, [pathname, search, onOpen]);
  return null;
}

export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const access = useFeatureAccess();
  const hydrated = useHasHydrated();
  const available = hydrated && canAccessFeature(access, "journal");
  const { isOpen: tourOpen } = useTour();
  const pathname = usePathname();
  const [active, setActive] = useState<ActiveCapture | null>(null);
  const current = useRef<ActiveCapture | null>(null);
  const pendingBack = useRef<string>();
  const prepare = useCallback(() => { void loadCapture().catch(() => undefined); }, []);

  const dismiss = useCallback((rewind: boolean) => {
    const opened = current.current;
    current.current = null;
    setActive(null);
    if (!rewind || !opened || window.location.pathname !== opened.pathname) return;
    if (opened.historyKey && window.history.state?.[STATE_KEY] === opened.historyKey) {
      pendingBack.current = opened.historyKey;
      window.history.back();
    } else if (!opened.historyKey) {
      const url = new URL(window.location.href);
      window.history.replaceState(null, "", withoutCaptureParams(url));
    }
  }, []);

  const start = useCallback((target: CaptureTarget, fromLink: boolean, nested = false) => {
    if (!available || current.current || pendingBack.current) return;
    if (!fromLink && (tourOpen || (!nested && hasOpenOverlay()))) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const historyKey = fromLink ? undefined : window.crypto.randomUUID();
    if (historyKey) {
      window.history.pushState({ ...window.history.state, [STATE_KEY]: historyKey }, "", window.location.href);
    }
    const next = { target, pathname, historyKey, opener };
    current.current = next;
    setActive(next);
  }, [available, pathname, tourOpen]);

  const open = useCallback((target: CaptureTarget = {}, nested = false) => start(target, false, nested), [start]);
  const openFromLink = useCallback((target: CaptureTarget) => start(target, true), [start]);
  const close = useCallback(() => dismiss(true), [dismiss]);

  useEffect(() => {
    if (active && (!available || active.pathname !== pathname)) dismiss(false);
  }, [active, available, pathname, dismiss]);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      pendingBack.current = undefined;
      const opened = current.current;
      if (!opened) return;
      const url = new URL(window.location.href);
      if (url.pathname !== opened.pathname ||
        (opened.historyKey
          ? event.state?.[STATE_KEY] !== opened.historyKey
          : !captureLink(url.pathname, url.searchParams, toISODate(new Date())))) dismiss(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [dismiss]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat || event.key.toLowerCase() !== "n") return;
      if (event.defaultPrevented || hasOpenOverlay()) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (!available || tourOpen) return;
      event.preventDefault();
      open();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [available, open, tourOpen]);

  const value = useMemo(() => ({ available, open, opened: active !== null, prepare }), [available, open, active, prepare]);
  return (
    <CaptureContext.Provider value={value}>
      {children}
      {available && <Suspense fallback={null}><CaptureDeepLink onOpen={openFromLink} /></Suspense>}
      {active && available && active.pathname === pathname && (
        <Suspense fallback={<p className="sr-only" role="status">Opening Daily Capture</p>}>
          <Workspace target={active.target} returnFocus={active.opener} onClose={close} />
        </Suspense>
      )}
    </CaptureContext.Provider>
  );
}
