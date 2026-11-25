"use client";

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
      aria-label="Add entry"
      aria-haspopup="dialog"
      aria-expanded={capture.opened}
      aria-keyshortcuts="Alt+N"
      title={mobile ? "Add entry (Alt+N)" : undefined}
      onClick={() => capture.open()}
      onPointerEnter={capture.prepare}
      onFocus={capture.prepare}
      className={cn(
        "pointer-events-auto grid place-items-center bg-accent font-semibold text-accent-fg shadow-soft hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        mobile
          ? "h-14 w-14 rounded-full"
          : "h-14 w-14 rounded-full border border-accent-fg/25 shadow-accent ring-2 ring-accent/25 ring-offset-2 ring-offset-card motion-safe:transition-transform motion-safe:hover:scale-105 motion-safe:active:scale-95",
      )}
    >
      <Plus className="h-7 w-7" strokeWidth={2.5} aria-hidden />
    </button>
  );
  return mobile ? button : <Tooltip content="Add entry (Alt+N)" describe={false}>{button}</Tooltip>;
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
