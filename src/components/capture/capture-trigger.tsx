"use client";

import { Plus } from "lucide-react";
import { useCapture } from "./capture-provider";
import { cn } from "@/lib/utils";
import type { CaptureTarget } from "@/lib/capture-routing";

export function CaptureTrigger({ mobile = false }: { mobile?: boolean }) {
  const capture = useCapture();
  if (!capture.available) return null;
  return (
    <button
      type="button"
      aria-label="Add entry"
      aria-haspopup="dialog"
      aria-expanded={capture.opened}
      aria-keyshortcuts="Alt+N"
      title="Add entry (Alt+N)"
      onClick={() => capture.open()}
      onPointerEnter={capture.prepare}
      onFocus={capture.prepare}
      className={cn(
        "pointer-events-auto grid place-items-center bg-accent font-semibold text-accent-fg shadow-soft hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        mobile ? "h-14 w-14 rounded-full" : "min-h-14 w-[3.75rem] gap-0.5 rounded-2xl px-1 py-2 text-[0.65rem] leading-none",
      )}
    >
      <Plus className={mobile ? "h-7 w-7" : "h-5 w-5"} aria-hidden />
      {!mobile && <span>Add entry</span>}
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
