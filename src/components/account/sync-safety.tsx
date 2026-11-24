"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff, History, RefreshCw, ShieldCheck, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { supabase } from "@/lib/supabase";
import { deviceLabel } from "@/lib/sync/device";
import { LIST_LABELS, type CountedList } from "@/lib/sync/integrity";
import type { HoldSummary, RecoveryReason } from "@/lib/sync/engine";
import { StatusScreen } from "./boot-screen";
import { useAccount, useSyncStatus } from "./account-session";

/* ════════════════════════════════════════════════════════════════
   WHAT THE STUDENT SEES WHEN SYNC STOPS TO PROTECT THEIR DATA
   Calm, plain words; versions and ids only behind "Technical details".
   ════════════════════════════════════════════════════════════════ */

/** "30 journal days → 0", most affected first. */
export function lossLines(summary: Pick<HoldSummary, "lists">, max = 5): string[] {
  return Object.entries(summary.lists)
    .sort(([, a], [, b]) => b[0] - b[1] - (a[0] - a[1]))
    .slice(0, max)
    .map(([k, [before, after]]) => `${before} ${LIST_LABELS[k as CountedList] ?? k} → ${after}`);
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

interface RecoveryPoint {
  id: number;
  version: number;
  reason: string;
  created_at: string;
  counts: Record<string, number> | null;
}

function pointSummary(counts: Record<string, number> | null): string {
  if (!counts) return "";
  const parts = (["journal", "lifeLog", "goals", "habits", "revisions"] as const)
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => `${counts[k]} ${LIST_LABELS[k]}`);
  return parts.join(" · ") || "No records";
}

/** The account can't be opened from the cloud and nothing has been written. */
export function RecoveryScreen({
  reason,
  error,
  deviceHasData,
  onRetry,
  onInitialise,
  onSignOut,
}: {
  reason: RecoveryReason;
  error: string | null;
  deviceHasData: boolean;
  onRetry: () => void;
  onInitialise: (intent: "fresh" | "device") => void;
  onSignOut: () => void;
}) {
  const confirm = useConfirm();
  const [points, setPoints] = useState<RecoveryPoint[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (reason !== "missing" || !supabase) return;
    let live = true;
    void Promise.resolve(
      supabase
        .from("chronicle_state_history")
        .select("id, version, reason, created_at, counts")
        .order("id", { ascending: false })
        .limit(5),
    ).then(({ data }) => {
      if (live) setPoints((data as RecoveryPoint[] | null) ?? []);
    }, () => live && setPoints([]));
    return () => {
      live = false;
    };
  }, [reason]);

  async function restore(point: RecoveryPoint) {
    if (!supabase) return;
    const ok = await confirm({
      title: "Restore this copy?",
      description: `Your chronicle comes back as it was on ${when(point.created_at)}.`,
      confirmLabel: "Restore",
    });
    if (!ok) return;
    setBusy(point.id);
    setNote(null);
    const { data, error: err } = await supabase.rpc("chronicle_restore", {
      p_history_id: point.id,
      p_expected_version: null,
      p_device: deviceLabel(),
    });
    setBusy(null);
    const status = (Array.isArray(data) ? data[0] : data)?.status;
    if (err || status !== "restored") {
      setNote("That copy couldn't be restored just now. Nothing was changed. Try again in a moment.");
      return;
    }
    onRetry();
  }

  async function startFresh() {
    const ok = await confirm({
      title: "Start with an empty chronicle?",
      description:
        reason === "missing"
          ? "A new, empty cloud copy is created for this account. The recovery copies listed here stay available."
          : "Only do this if you have never used this account anywhere else. If you have, open the app there first instead.",
      confirmLabel: "Start empty",
      tone: "danger",
    });
    if (ok) onInitialise("fresh");
  }

  const missing = reason === "missing";
  return (
    <StatusScreen
      icon={ShieldCheck}
      title={missing ? "We couldn't find your cloud data" : "We couldn't verify your cloud data"}
      body={
        <>
          {missing
            ? "Your account had a cloud copy, but it can't be found right now."
            : "This account has no cloud copy yet, and this browser holds none of its data. If you've used it in another browser or on another device, open it there first: that device will upload its copy and this screen will clear."}{" "}
          <span className="font-medium text-paper/80">
            Your account has not been reset, and no new snapshot has been created.
          </span>
          {error && <span className="mt-2 block text-paper/45">{error}</span>}
          {note && <span className="mt-2 block text-danger">{note}</span>}
        </>
      }
    >
      {missing && points && points.length > 0 && (
        <div className="space-y-2 text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-paper/45">Recovery copies</p>
          {points.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-paper">{when(p.created_at)}</p>
                <p className="truncate text-xs text-paper/50">{pointSummary(p.counts)}</p>
              </div>
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void restore(p)}>
                <History className="h-3.5 w-3.5" /> {busy === p.id ? "Restoring…" : "Restore"}
              </Button>
            </div>
          ))}
        </div>
      )}
      {missing && deviceHasData && (
        <Button onClick={() => onInitialise("device")}>
          <Upload className="h-4 w-4" /> Upload this device&apos;s copy
        </Button>
      )}
      <Button variant={missing && (deviceHasData || points?.length) ? "ghost" : "primary"} onClick={onRetry}>
        <RefreshCw className="h-4 w-4" /> Try again
      </Button>
      <Button variant="subtle" onClick={() => void startFresh()}>
        Start with an empty chronicle
      </Button>
      <Button variant="subtle" onClick={onSignOut}>
        Sign out
      </Button>
    </StatusScreen>
  );
}

/** A fresh device whose app is older than the one that last saved the account. */
export function OutdatedScreen() {
  return (
    <StatusScreen
      icon={RefreshCw}
      title="Update needed"
      body="Your chronicle was last saved by a newer version of the app. Reload to update; nothing has been changed."
    >
      <Button onClick={() => window.location.reload()}>
        <RefreshCw className="h-4 w-4" /> Reload
      </Button>
    </StatusScreen>
  );
}

/** The cloud couldn't be reached and this browser has no verified copy. */
export function UnverifiedScreen({
  error,
  onRetry,
  onSignOut,
}: {
  error: string | null;
  onRetry: () => void;
  onSignOut?: () => void;
}) {
  return (
    <StatusScreen
      icon={CloudOff}
      title="We couldn't verify your cloud data"
      body={
        <>
          This browser doesn&apos;t have a verified copy of your chronicle, and the cloud can&apos;t be reached
          right now.{" "}
          <span className="font-medium text-paper/80">Your account has not been reset.</span> Editing opens once
          your data has loaded.
          {error && <span className="mt-2 block text-paper/45">{error}</span>}
        </>
      }
    >
      <Button onClick={onRetry}>
        <RefreshCw className="h-4 w-4" /> Try again
      </Button>
      {onSignOut && (
        <Button variant="ghost" onClick={onSignOut}>
          Sign out
        </Button>
      )}
    </StatusScreen>
  );
}

/**
 * Inside the app: the decision a held save waits for, and a note when this
 * copy of the app is too old to save.
 */
export function SyncGuard() {
  const { act } = useAccount();
  const { sync } = useSyncStatus();
  const confirm = useConfirm();
  const hold = sync.status === "held" || (sync.status === "syncing" && sync.hold) ? sync.hold : null;
  const busy = sync.status === "syncing";

  async function confirmRemoval() {
    if (!hold) return;
    const ok = await confirm({
      title: `Remove ${hold.summary.removed} records from your account?`,
      description:
        "They are removed from every device. A copy of your cloud data as it is now is kept first, and can be restored from Settings → Data.",
      confirmLabel: "Remove them",
      tone: "danger",
    });
    if (ok) act({ kind: "resolveHold", choice: "confirm" });
  }

  return (
    <>
      {/* A Modal, so the confirmation it can open stacks above it. It can't be
          dismissed: the save stays held until the student chooses. */}
      <Modal open={Boolean(hold)} onClose={() => undefined} ariaLabel="Your cloud data is protected">
        {hold && (
          <div>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-accent/[0.12] text-accent">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h2 className="mt-4 font-display text-lg font-bold tracking-tightest text-paper">
              Your cloud data is protected
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-paper/65">
              {hold.summary.profileReset && !Object.keys(hold.summary.lists).length
                ? "This device's copy looks like a brand-new account, while your cloud data is already set up."
                : "This device's copy is missing much of what's in your cloud data."}{" "}
              Nothing has been removed. If you didn&apos;t mean to delete these, bring them back.
            </p>
            {lossLines(hold.summary).length > 0 && (
              <ul className="mt-3 space-y-1 rounded-2xl border border-line px-4 py-3 text-sm text-paper/75">
                {lossLines(hold.summary).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
            {sync.error && <p className="mt-3 text-xs text-paper/50">{sync.error}</p>}
            <div className="mt-5 flex flex-col gap-2.5">
              <Button disabled={busy} onClick={() => act({ kind: "resolveHold", choice: "restore" })}>
                <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Bring my data back
              </Button>
              <Button variant="subtle" disabled={busy} onClick={() => void confirmRemoval()}>
                I deleted them on purpose
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <AnimatePresence>
        {sync.status === "outdated" && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed left-1/2 top-3 z-[75] w-[min(92vw,30rem)] -translate-x-1/2"
            role="status"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-card/95 py-2 pl-4 pr-2 shadow-lift backdrop-blur-xl">
              <TriangleAlert className="h-4 w-4 shrink-0 text-paper/55" />
              <span className="text-xs leading-snug text-paper/70">
                A newer version of the app saved your data. Reload to keep syncing; your changes here are saved on
                this device.
              </span>
              <Button size="sm" onClick={() => window.location.reload()}>
                Reload
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
