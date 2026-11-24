"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, History, LifeBuoy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useConfirmedDownload } from "@/components/ui/confirm-download";
import { useAccount, useSyncStatus } from "@/components/account/account-session";
import { discardSafetyCopies, readSafetyCopies, type SafetyCopy } from "@/lib/account/session";
import { supabase } from "@/lib/supabase";
import { STORE_VERSION } from "@/lib/store";
import { deviceLabel } from "@/lib/sync/device";
import { LIST_LABELS } from "@/lib/sync/integrity";
import { lossLines } from "@/components/account/sync-safety";

/* ════════════════════════════════════════════════════════════════
   RECOVERY (Settings → Data)
   The cloud's recovery copies of this account (a daily copy, and one
   before every large change or restore), the safety copies this device
   kept, and, folded away, the technical trail of recent sync events.
   Everything here is the signed-in account's own: the tables are limited
   to their owner by row level security.
   ════════════════════════════════════════════════════════════════ */

interface Point {
  id: number;
  version: number;
  reason: "checkpoint" | "before_replace" | "before_restore";
  created_at: string;
  counts: Record<string, number> | null;
}

interface SyncEvent {
  id: number;
  event: string;
  device: string | null;
  version: number | null;
  created_at: string;
}

interface CloudRow {
  version: number;
  updated_at: string;
  schema_version: number;
  last_device: string | null;
}

const REASONS: Record<Point["reason"], string> = {
  checkpoint: "Daily copy",
  before_replace: "Before a large change",
  before_restore: "Before a restore",
};

const SAFETY_REASONS: Record<SafetyCopy["reason"], string> = {
  unreadable: "This browser's copy, which couldn't be read",
  foreign: "A copy found under this account that wasn't its own",
  before_cloud_removal: "This device's copy before a change from another device removed much of it",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function summary(counts: Record<string, number> | null): string {
  if (!counts) return "";
  const parts = (["journal", "lifeLog", "goals", "habits", "revisions", "reflections"] as const)
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => `${counts[k]} ${LIST_LABELS[k]}`);
  return parts.join(" · ") || "No records";
}

export function RecoveryPanel() {
  const { accountId, syncNow } = useAccount();
  const { sync } = useSyncStatus();
  const confirm = useConfirm();
  const download = useConfirmedDownload();
  const [points, setPoints] = useState<Point[] | null>(null);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [row, setRow] = useState<CloudRow | null>(null);
  const [copies, setCopies] = useState<SafetyCopy[]>(() => readSafetyCopies(accountId));
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [p, e, r] = await Promise.all([
      supabase
        .from("chronicle_state_history")
        .select("id, version, reason, created_at, counts")
        .order("id", { ascending: false })
        .limit(10),
      supabase
        .from("chronicle_sync_events")
        .select("id, event, device, version, created_at")
        .order("id", { ascending: false })
        .limit(12),
      supabase
        .from("chronicle_state")
        .select("version, updated_at, schema_version, last_device")
        .eq("user_id", accountId)
        .maybeSingle(),
    ]);
    setPoints((p.data as Point[] | null) ?? []);
    setEvents((e.data as SyncEvent[] | null) ?? []);
    setRow((r.data as CloudRow | null) ?? null);
  }, [accountId]);

  useEffect(() => {
    void load().catch(() => setPoints([]));
  }, [load]);

  async function downloadPoint(p: Point) {
    if (!supabase) return;
    const { data, error } = await supabase.from("chronicle_state_history").select("data").eq("id", p.id).maybeSingle();
    if (error || !data) {
      setNote({ kind: "err", text: "That copy couldn't be downloaded. Try again in a moment." });
      return;
    }
    await download({
      title: "Download this recovery copy?",
      description: `Your chronicle as it was on ${when(p.created_at)}, as a JSON file you can restore from later.`,
      fileName: `upsc-chronicle-recovery-${p.created_at.slice(0, 10)}-v${p.version}.json`,
      content: () =>
        JSON.stringify({ exportedAt: new Date().toISOString(), account: { id: accountId }, data: (data as { data: unknown }).data }, null, 2),
      type: "application/json",
    });
  }

  async function restore(p: Point) {
    if (!supabase || !row) return;
    const ok = await confirm({
      title: "Restore this copy?",
      description: `Your chronicle goes back to how it was on ${when(p.created_at)}, on every device. Your data as it is now is kept as a recovery copy first, so this can be undone.`,
      confirmLabel: "Restore",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setNote(null);
    const { data, error } = await supabase.rpc("chronicle_restore", {
      p_history_id: p.id,
      p_expected_version: row.version,
      p_device: deviceLabel(),
    });
    setBusy(false);
    const status = (Array.isArray(data) ? data[0] : data)?.status as string | undefined;
    if (error || !status) {
      setNote({ kind: "err", text: "The copy couldn't be restored. Nothing was changed." });
    } else if (status === "conflict") {
      setNote({ kind: "err", text: "Your data changed on another device a moment ago. Nothing was changed; look again and retry." });
    } else if (status === "restored") {
      setNote({ kind: "ok", text: "Restored. Your devices pick it up as they sync." });
      syncNow();
    } else {
      setNote({ kind: "err", text: "That copy is no longer available." });
    }
    await load().catch(() => undefined);
  }

  function downloadCopy(c: SafetyCopy, i: number) {
    void download({
      title: "Download this safety copy?",
      description: SAFETY_REASONS[c.reason] + ".",
      fileName: `upsc-chronicle-device-copy-${(c.at ?? "").slice(0, 10)}-${i + 1}.json`,
      content: () => (c.raw ? c.raw : JSON.stringify({ exportedAt: c.at, account: { id: accountId }, data: c.data }, null, 2)),
      type: "application/json",
    });
  }

  async function discardCopies() {
    const ok = await confirm({
      title: "Discard the safety copies on this device?",
      description: "Download them first if you might need them. Your account's data isn't affected.",
      confirmLabel: "Discard",
      tone: "danger",
    });
    if (!ok) return;
    discardSafetyCopies(accountId);
    setCopies([]);
  }

  return (
    <div className="space-y-4" data-testid="recovery-panel">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-paper">
          <LifeBuoy className="h-4 w-4 text-accent" /> Recovery copies
        </p>
        <p className="mt-1 text-xs leading-relaxed text-paper/50">
          The cloud keeps a copy of your data from each of the last few days, and one before any large change or
          restore. A save that would remove a large part of your data is never applied without asking you.
        </p>
      </div>

      {points === null ? (
        <p className="text-xs text-paper/45">Loading…</p>
      ) : points.length === 0 ? (
        <p className="text-xs text-paper/45">No recovery copies yet. The first is kept after a day of use.</p>
      ) : (
        <ul className="space-y-2">
          {points.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-2xl border border-line px-3.5 py-2.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-paper">
                  {when(p.created_at)} <span className="text-paper/45">· {REASONS[p.reason] ?? p.reason}</span>
                </p>
                <p className="truncate text-xs text-paper/50">{summary(p.counts)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="ghost" onClick={() => void downloadPoint(p)}>
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
                <Button size="sm" variant="ghost" disabled={busy || !row} onClick={() => void restore(p)}>
                  <History className="h-3.5 w-3.5" /> Restore
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {note && <p className={note.kind === "ok" ? "text-xs text-accent" : "text-xs text-danger"}>{note.text}</p>}

      {copies.length > 0 && (
        <div className="rounded-2xl border border-line p-4">
          <p className="text-sm font-semibold text-paper">Safety copies on this device</p>
          <ul className="mt-2 space-y-2">
            {copies.map((c, i) => (
              <li key={`${c.at}-${i}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 text-xs leading-relaxed text-paper/60">
                  {c.at ? `${when(c.at)} · ` : ""}
                  {SAFETY_REASONS[c.reason]}
                  {c.summary && lossLines(c.summary, 3).length > 0 && (
                    <span className="block text-paper/45">{lossLines(c.summary, 3).join(" · ")}</span>
                  )}
                </div>
                <Button size="sm" variant="ghost" className="shrink-0" onClick={() => downloadCopy(c, i)}>
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="subtle" className="mt-2" onClick={() => void discardCopies()}>
            <Trash2 className="h-3.5 w-3.5" /> Discard
          </Button>
        </div>
      )}

      <details className="rounded-2xl border border-line px-4 py-3 text-xs text-paper/55">
        <summary className="cursor-pointer select-none text-paper/70">Technical details</summary>
        <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1">
          <dt className="text-paper/40">Cloud version</dt>
          <dd>{row ? `${row.version} · saved ${when(row.updated_at)}` : "—"}</dd>
          <dt className="text-paper/40">Last saved by</dt>
          <dd className="break-all">{row?.last_device ?? "—"}</dd>
          <dt className="text-paper/40">This device</dt>
          <dd className="break-all">{deviceLabel()}</dd>
          <dt className="text-paper/40">Synced copy here</dt>
          <dd>{sync.baseVersion != null ? `version ${sync.baseVersion}` : "none yet"}</dd>
          <dt className="text-paper/40">Data format</dt>
          <dd>
            app {STORE_VERSION}
            {row ? ` · cloud ${row.schema_version}` : ""}
          </dd>
        </dl>
        {events.length > 0 && (
          <ul className="mt-3 space-y-0.5 border-t border-line pt-2 font-mono text-[0.68rem] text-paper/50">
            {events.map((e) => (
              <li key={e.id} className="break-all">
                {when(e.created_at)} · {e.event}
                {e.version != null ? ` · v${e.version}` : ""}
                {e.device ? ` · ${e.device}` : ""}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
