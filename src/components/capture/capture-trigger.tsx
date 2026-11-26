"use client";

import styles from "./capture-trigger.module.css";
import { Plus } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { useCapture } from "./capture-provider";
import { cn } from "@/lib/utils";
import type { CaptureTarget } from "@/lib/capture-routing";

export function CaptureTrigger({ mobile = false }: { mobile?: boolean }) {
  const capture = useCapture();
  if (!capture.available) return null;
  const button = (
    <button
      type="button"
      aria-label="Log today’s progress"
      aria-haspopup="dialog"
      aria-expanded={capture.opened}
      aria-keyshortcuts="Alt+N"
      title={mobile ? "Log today’s progress" : undefined}
      onClick={() => capture.open()}
      onPointerEnter={capture.prepare}
      onFocus={capture.prepare}
      className={cn(styles.trigger, mobile ? styles.mobile : styles.rail)}
    >
      <span className={styles.disc} aria-hidden="true">
        <Plus className={styles.plus} strokeWidth={2.5} />
      </span>
      {!mobile && <span className={styles.label}>Log today’s progress</span>}
    </button>
  );
  return mobile ? button : <Tooltip content="Log today’s progress (Alt+N)" describe={false}>{button}</Tooltip>;
}

export function CaptureSectionButton({ target, className, children, nested }: {
  target: CaptureTarget;
  nested?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const capture = useCapture();
  if (!capture.available) return null;
  return (
    <button type="button" aria-haspopup="dialog" onClick={() => capture.open(target, nested)}
      onFocus={capture.prepare} onPointerEnter={capture.prepare}
      className={cn("inline-flex min-h-11 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent", className)}>
      {children}
    </button>
  );
}
