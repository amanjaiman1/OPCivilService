"use client";

import { useEffect, useState, type PointerEvent } from "react";
import { usePathname } from "next/navigation";
import { House, MessageCircleQuestion } from "lucide-react";
import { CaptureTrigger } from "@/components/capture/capture-trigger";
import { useCapture } from "@/components/capture/capture-provider";
import { useFeatureAccess } from "@/components/features/feature-access";
import { helpButtonLabel, useHelpFeedback } from "@/components/help/help-feedback";
import { canAccessFeature } from "@/lib/features";
import { isActivePath } from "@/lib/nav";
import { AppLink } from "./app-link";
import styles from "./bottom-nav.module.css";

type LensSide = "home" | "help";

export function QuickActionsDock() {
  const [hoveredSide, setHoveredSide] = useState<LensSide | null>(null);
  const { available } = useCapture();
  const access = useFeatureAccess();
  const help = useHelpFeedback();
  const home = canAccessFeature(access, "dashboard");
  const homeActive = isActivePath(usePathname(), "/dashboard");
  const visible = home || available || Boolean(help);

  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    root.dataset.quickActionsDock = "true";
    return () => { delete root.dataset.quickActionsDock; };
  }, [visible]);

  function previewSide(event: PointerEvent, side: LensSide) {
    if (available && event.pointerType === "mouse" && window.matchMedia("(min-width: 1024px)").matches) {
      setHoveredSide(side);
    }
  }

  function resetLens() {
    setHoveredSide(null);
  }

  if (!visible) return null;

  return (
    <nav aria-label="Quick actions" className={`${styles.wrap} pointer-events-none fixed inset-x-0 z-30 flex items-center justify-center`}>
      <div
        className={`${styles.dock} ${available ? "" : styles.compact}`}
        data-lens-side={hoveredSide ?? "center"}
        onPointerLeave={resetLens}
        onPointerCancel={resetLens}
        onClickCapture={resetLens}
      >
        {available && <span className={styles.lens} data-dock-lens aria-hidden="true" />}
        {home && (
          <AppLink
            href="/dashboard"
            aria-label="Home"
            aria-current={homeActive ? "page" : undefined}
            onPointerEnter={(event) => previewSide(event, "home")}
            onPointerLeave={resetLens}
            className={`${styles.action} ${styles.home}`}
          >
            <House aria-hidden className={styles.house} />
          </AppLink>
        )}
        {available && <CaptureTrigger className={styles.capture} />}
        {help && (
          <button
            type="button"
            aria-label={helpButtonLabel(help.unseen)}
            aria-haspopup="dialog"
            aria-expanded={help.isOpen}
            data-testid="help-feedback-button"
            onPointerEnter={(event) => previewSide(event, "help")}
            onPointerLeave={resetLens}
            onClick={() => help.open()}
            className={`${styles.action} ${styles.help}`}
          >
            <span className={styles.helpIcon} aria-hidden="true">
              <MessageCircleQuestion />
              {help.unseen > 0 && <span className={styles.badge}>{help.unseen > 9 ? "9+" : help.unseen}</span>}
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}
