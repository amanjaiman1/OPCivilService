"use client";

import styles from "./capture-trigger.module.css";
import { Plus } from "lucide-react";
import { useCapture } from "./capture-provider";
import { cn } from "@/lib/utils";
import type { CaptureTarget } from "@/lib/capture-routing";

export function CaptureTrigger() {
  const capture = useCapture();
  if (!capture.available) return null;
  return (
    <button
      type="button"
      aria-label="Log today’s progress"
      aria-haspopup="dialog"
      aria-expanded={capture.opened}
      aria-keyshortcuts="Alt+N"
      title="Log today’s progress (Alt+N)"
      onClick={() => capture.open()}
      onPointerEnter={capture.prepare}
      onFocus={capture.prepare}
      className={styles.trigger}
    >
      <Plus className={styles.plus} strokeWidth={2.5} aria-hidden />
      <span className={styles.label}>Log entry</span>
    </button>
  );
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
