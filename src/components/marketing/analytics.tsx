"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ════════════════════════════════════════════════════════════════
   GOOGLE TAGS, OPT-IN
   The public site's layout enables Tag Manager. The optional direct GA4
   integration also covers the sign-in screens. Both wait for the visitor
   to agree in the banner, and the choice is remembered on this device.

   It is mounted by the public site's layout and the sign-in screens only.
   While it is unmounted (inside the app itself) Google's opt-out flag is
   set, so nothing about anyone's preparation is ever sent.

   Page views are sent from here, so in GA4 turn off Enhanced measurement →
   Page views → "Page changes based on browser history events", or client
   navigations are counted twice. See docs/SEO_SETUP_GUIDE.md.
   ════════════════════════════════════════════════════════════════ */

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "";
const GTM_ID = "GTM-WMRWPLMS";
const CONSENT_KEY = "doordie-analytics-consent";

type Choice = "granted" | "denied";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const disableFlag = `ga-disable-${GA_ID}`;
function setDisabled(disabled: boolean) {
  (window as unknown as Record<string, boolean>)[disableFlag] = disabled;
}

function appendGoogleScript(path: string, id: string) {
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = `https://www.googletagmanager.com/${path}?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

function loadGoogleTags(includeTagManager: boolean) {
  const dataLayer = (window.dataLayer ??= []);
  if (!window.gtag) {
    window.gtag = function gtag() {
      // gtag.js expects the arguments object itself.
      // eslint-disable-next-line prefer-rest-params
      dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
  }

  if (includeTagManager && !document.getElementById(GTM_ID)) {
    dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    appendGoogleScript("gtm.js", GTM_ID);
  }
  if (GA_ID && !document.getElementById(GA_ID)) {
    window.gtag("config", GA_ID, { send_page_view: false });
    appendGoogleScript("gtag/js", GA_ID);
  }
}

/** Sends an event if analytics is on and allowed; otherwise does nothing. */
export function track(event: string, params: Record<string, string | number> = {}) {
  if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
  if ((window as unknown as Record<string, boolean>)[disableFlag]) return;
  window.gtag("event", event, params);
}

function readChoice(): Choice | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function Analytics({ includeTagManager = false }: { includeTagManager?: boolean }) {
  const pathname = usePathname();
  const enabled = Boolean(GA_ID) || includeTagManager;
  // `undefined` until the stored choice has been read, so the banner never
  // flashes for someone who already answered.
  const [choice, setChoice] = useState<Choice | null | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    setChoice(readChoice());
    if (!GA_ID) return;
    setDisabled(false);
    return () => setDisabled(true);
  }, [enabled]);

  useEffect(() => {
    if (enabled && choice === "granted") loadGoogleTags(includeTagManager);
  }, [choice, enabled, includeTagManager]);

  useEffect(() => {
    if (choice !== "granted") return;
    track("page_view", { page_location: window.location.href, page_path: pathname, page_title: document.title });
  }, [choice, pathname]);

  // Any element with data-track="name" reports a click as cta_click.
  useEffect(() => {
    if (choice !== "granted") return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-track]") as HTMLElement | null;
      if (!el?.dataset.track) return;
      track("cta_click", {
        cta: el.dataset.track,
        link_url: el instanceof HTMLAnchorElement ? el.pathname : "",
        page_path: window.location.pathname,
      });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [choice]);

  if (!enabled || choice !== null) return null;

  const choose = (c: Choice) => {
    try {
      localStorage.setItem(CONSENT_KEY, c);
    } catch {
      /* storage blocked: ask again next time */
    }
    setChoice(c);
  };

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-line bg-card p-4 shadow-lift sm:inset-x-auto sm:left-5 sm:bottom-5 sm:max-w-sm"
    >
      <p className="text-sm font-semibold text-paper">Can we count your visit?</p>
      <p className="mt-1 text-xs leading-relaxed text-paper/65">
        With your permission, we use Google tags to see which pages people visit. These tags may set cookies.{" "}
        <Link href="/privacy-policy" className="font-semibold text-accent hover:underline">
          Privacy policy
        </Link>
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => choose("granted")}
          className="h-9 rounded-full bg-accent px-4 text-xs font-semibold text-accent-fg hover:brightness-[1.08]"
        >
          Allow analytics
        </button>
        <button
          onClick={() => choose("denied")}
          className="h-9 rounded-full border border-line px-4 text-xs font-semibold text-paper/75 hover:border-paper/25 hover:text-paper"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}

/**
 * Lets a visitor change their mind: forgets the stored choice, so the banner
 * asks again. Shown on the public privacy policy.
 */
export function AnalyticsChoiceReset() {
  const [cleared, setCleared] = useState(false);
  return (
    <button
      onClick={() => {
        try {
          localStorage.removeItem(CONSENT_KEY);
        } catch {
          /* nothing stored */
        }
        setCleared(true);
        window.location.reload();
      }}
      className="inline-flex h-10 items-center rounded-full border border-line bg-card px-4 text-sm font-semibold text-paper hover:border-paper/25"
    >
      {cleared ? "Choice cleared" : "Change my analytics choice"}
    </button>
  );
}
