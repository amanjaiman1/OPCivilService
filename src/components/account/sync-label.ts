import {
  Check,
  CloudOff,
  FlaskConical,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { AccountMode } from "@/lib/account/session";
import type { SyncView } from "./account-session";

export interface SyncLabel {
  label: string;
  detail: string;
  icon: LucideIcon;
  tone: "ok" | "busy" | "muted" | "warn";
  spin?: boolean;
}

function ago(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** One phrasing of the sync state, shared by the menu and the settings page. */
export function describeSync(sync: SyncView, mode: AccountMode): SyncLabel {
  if (mode === "demo") {
    return {
      label: "Demo",
      detail: "A sample account with made-up data. Nothing you change is saved, and it resets when you leave.",
      icon: FlaskConical,
      tone: "muted",
    };
  }
  if (mode === "local") {
    return {
      label: "On this device",
      detail: "Accounts aren't set up in this build, so data stays in this browser.",
      icon: HardDrive,
      tone: "muted",
    };
  }
  if (sync.status === "held") {
    return {
      label: "Needs your decision",
      detail: "A change on this device would remove much of your data. Your cloud data is protected until you choose.",
      icon: ShieldCheck,
      tone: "warn",
    };
  }
  if (sync.status === "recovery") {
    return {
      label: "Recovery needed",
      detail: "We couldn't safely load your account. No new snapshot has been created.",
      icon: ShieldCheck,
      tone: "warn",
    };
  }
  if (sync.status === "outdated") {
    return {
      label: "Update needed",
      detail: sync.pending
        ? "Saved on this device, not yet in the cloud. A newer version of the app saved your data: reload to keep syncing."
        : "A newer version of the app saved your data. Reload to keep syncing.",
      icon: TriangleAlert,
      tone: "warn",
    };
  }
  if (sync.status === "offline") {
    return {
      label: "Offline",
      detail: sync.pending
        ? "Saved on this device, not yet in the cloud. Keep this browser's data until it syncs; it will when you're back online."
        : "Everything is in the cloud. Sync resumes when you're back online.",
      icon: CloudOff,
      tone: "muted",
    };
  }
  if (sync.status === "error") {
    return {
      label: "Sync paused",
      detail: `${sync.error ?? "Something went wrong."} Your changes are saved on this device, not yet in the cloud.`,
      icon: TriangleAlert,
      tone: "warn",
    };
  }
  if (sync.pending || sync.status === "syncing" || sync.status === "idle") {
    return { label: "Syncing…", detail: "Saving your latest changes to the cloud.", icon: RefreshCw, tone: "busy", spin: true };
  }
  return {
    label: "Synced",
    detail: `All your preparation data is up to date${sync.lastSyncedAt ? ` · ${ago(sync.lastSyncedAt)}` : ""}.`,
    icon: Check,
    tone: "ok",
  };
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
