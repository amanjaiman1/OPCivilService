"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminApi, useAdmin } from "@/lib/platform/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type Section = "reviews" | "feedback";
type Indicators = Partial<Record<Section, { cursor: string; unseen: boolean; pending: number; crashes?: number }>>;
const Context = createContext<Indicators>({});
export const useAttention = () => useContext(Context);

const sections = [
  { key: "reviews", label: "Reviews awaiting moderation", href: "/admin/reviews" },
  { key: "feedback", label: "Feedback awaiting a response", href: "/admin/feedback" },
] as const;

export function AttentionProvider({ children }: { children: React.ReactNode }) {
  const { data, refresh } = useAdmin<Indicators>("attention");
  const at = useRef(0);
  useEffect(() => {
    function foreground() {
      if (document.visibilityState !== "visible" || Date.now() - at.current < 60_000) return;
      at.current = Date.now();
      void refresh();
    }
    document.addEventListener("visibilitychange", foreground);
    const updated = () => void refresh();
    window.addEventListener("platform:attention-updated", updated);
    at.current = Date.now();
    return () => {
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("platform:attention-updated", updated);
    };
  }, [refresh]);
  return <Context.Provider value={data ?? {}}>{children}</Context.Provider>;
}

export function AttentionSummary() {
  const data = useAttention();
  const [busy, setBusy] = useState<Section | null>(null);
  const [seen, setSeen] = useState<Partial<Record<Section, string>>>({});
  const [error, setError] = useState("");
  const items = sections.filter(({ key }) => data[key]);
  if (!items.length) return null;

  async function acknowledge(section: Section, cursor: string) {
    setBusy(section);
    setError("");
    try {
      await adminApi.post("attention", { section, cursor });
      setSeen((value) => ({ ...value, [section]: cursor }));
      window.dispatchEvent(new Event("platform:attention-updated"));
    } catch {
      setError("The update couldn’t be marked seen. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3 p-4 sm:p-5">
      <h2 className="font-semibold text-paper">Needs attention</h2>
      {items.map(({ key, label, href }) => {
        const entry = data[key]!;
        return (
          <div key={key} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
            <div className="space-y-1">
              <Link className="block font-semibold text-accent hover:underline" href={href}>{entry.pending} {label.toLowerCase()}</Link>
              {entry.crashes !== undefined && <Link className="block text-paper/70 hover:text-accent" href="/admin/feedback">{entry.crashes} open crash groups</Link>}
            </div>
            {entry.unseen && seen[key] !== entry.cursor &&
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void acknowledge(key, entry.cursor)}>
                Mark {key === "reviews" ? "review" : "feedback"} updates seen
              </Button>}
          </div>
        );
      })}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </Card>
  );
}
