"use client";

import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntryGuide } from "@/lib/entry-guides";
import { useTour } from "./tour-context";

export function EntryGuideButton({ guide, inCapture = false }: { guide: EntryGuide; inCapture?: boolean }) {
  const tour = useTour();
  return (
    <button type="button" aria-label={`Entry guide · ${guide.title}`} aria-haspopup="dialog"
      title={guide.title} onClick={() => tour.openGuide(guide, inCapture)}
      className={cn("inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl text-paper/75 hover:bg-paper/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent", inCapture ? "px-2 text-xs font-semibold" : "w-11 lg:w-auto lg:px-2.5 lg:text-xs lg:font-semibold")}
    >
      <CircleHelp className="h-5 w-5" aria-hidden />
      <span className={inCapture ? undefined : "hidden lg:inline"}>Entry guide</span>
    </button>
  );
}
