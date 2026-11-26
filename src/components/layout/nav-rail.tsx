"use client";

import { AppLink as Link } from "./app-link";
import { warmOverlays } from "./overlays";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  BedDouble,
  Sunrise,
  Palette,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { isActivePath } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/button";
import { AccountMenu } from "@/components/account/account-menu";
import { NotificationCentre } from "@/components/notifications/centre";
import { Logo } from "./logo";

import { useFeatureAccess } from "@/components/features/feature-access";
import { canAccessFeature } from "@/lib/features";
import { useSleepQuickActions } from "@/components/sleep/sleep-editor";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAccount } from "@/components/account/account-session";
import { formatClock, nightLabel, timeFormatOf } from "@/lib/sleep";
import { useChronicle } from "@/lib/store";
import { getActiveAccountId } from "@/lib/account/scope";

function SleepRailAction() {
  const action = useSleepQuickActions();
  const toast = useToast();
  const confirm = useConfirm();
  const format = useChronicle((s) => timeFormatOf(s.profile));
  if (!action.canWakeNow && !action.canBedNow) return null;
  const waking = action.canWakeNow;
  const label = waking ? "Woke up now" : "Going to bed now";
  const Icon = waking ? Sunrise : BedDouble;
  const date = waking ? action.today : action.tonightDate;
  return (
    <IconButton label={label} size="lg" aria-haspopup="dialog" onClick={async () => {
      const account = getActiveAccountId();
      if (!date || !(await confirm({
        title: waking ? "Record wake-up time?" : "Record bedtime?",
        description: `Save ${formatClock(waking ? action.wakeClock : action.nowClock, format)} for the night of ${nightLabel(date)}.`,
        confirmLabel: waking ? "Record wake-up" : "Record bedtime",
        tone: "default",
        icon: Icon,
      })) || account !== getActiveAccountId()) return;

      const night = useChronicle.getState().lifeLog.find((entry) => entry.date === date);
      if (waking ? !night?.bedtime || night.wakeTime : night?.bedtime) return;
      if (waking) action.wakeNow();
      else action.bedNow();
      toast({ title: waking ? "Wake-up time recorded" : "Bedtime recorded" });
    }}>
      <Icon className="h-5 w-5" aria-hidden />
    </IconButton>
  );
}

function RailLink({
  href,
  label,
  icon: Icon,
  active,
  utility = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** Drawn as a glass button, like the utilities beside it, rather than a nav item. */
  utility?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative grid h-11 w-11 place-items-center rounded-2xl transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
        utility
          ? cn("lg-clear", active ? "text-accent" : "text-paper/65 hover:text-paper")
          : active
            ? "bg-[var(--nav-active)] text-accent shadow-[inset_0_0_0_1px_var(--nav-active-ring),0_6px_16px_-10px_rgb(var(--shadow)/0.45)]"
            : "text-paper/60 hover:bg-[var(--nav-hover)] hover:text-paper",
      )}
    >
      <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={active ? 2.1 : 1.85} />
    </Link>
  );
}

/**
 * The slim rail at the far left on a desktop: the brand, the account, the
 * everyday shortcuts, and the utilities (search, notifications, appearance,
 * settings). It stays put while the sidebar beside it opens and closes.
 */
export function NavRail({
  sidebarOpen,
  onToggleSidebar,
  onOpenPalette,
  onOpenAppearance,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenPalette: () => void;
  onOpenAppearance: () => void;
}) {
  const pathname = usePathname();
  const access = useFeatureAccess();
  const { mode } = useAccount();

  return (
    <nav
      aria-label="Global actions"
      className="chrome-glass relative flex h-full w-[4.75rem] shrink-0 flex-col items-center rounded-[1.75rem] py-4"
    >
      <Link
        href="/dashboard"
        aria-label="DoOrDie — Home"
        title="DoOrDie"
        className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-card shadow-soft transition-transform duration-200 hover:-translate-y-px"
      >
        <Logo className="h-6 w-6" />
      </Link>

      <div className="relative mt-4">
        <AccountMenu placement="rail" />
        {/* The sidebar's handle, on the rail's edge beside the avatar. */}
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Hide navigation" : "Show navigation"}
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
          title={sidebarOpen ? "Hide navigation" : "Show navigation"}
          className="chrome-glass absolute -right-[1.85rem] top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-paper/65 transition-colors hover:text-paper"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-300", sidebarOpen && "rotate-180")} />
        </button>
      </div>

      {mode !== "demo" && canAccessFeature(access, "life") && (
        <div className="mt-6">
          <SleepRailAction />
        </div>
      )}

      <div className="flex-1" />

      <div className="flex flex-col items-center gap-1.5 border-t border-line pt-3">
        <IconButton label="Search (Ctrl K)" size="lg" onClick={onOpenPalette} onPointerEnter={() => warmOverlays("palette")} onFocus={() => warmOverlays("palette")} className="rounded-2xl">
          <Search className="h-[1.1rem] w-[1.1rem]" />
        </IconButton>
        <NotificationCentre placement="rail" className="h-11 w-11 rounded-2xl" />
        <IconButton label="Appearance" size="lg" onClick={onOpenAppearance} onPointerEnter={() => warmOverlays("appearance")} onFocus={() => warmOverlays("appearance")} className="rounded-2xl">
          <Palette className="h-[1.1rem] w-[1.1rem]" />
        </IconButton>
        <RailLink href="/settings" label="Settings" icon={Settings} active={isActivePath(pathname, "/settings")} utility />
      </div>
    </nav>
  );
}
