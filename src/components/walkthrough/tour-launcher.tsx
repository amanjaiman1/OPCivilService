"use client";

import { Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTour } from "@/components/tour/tour-context";
import { hasWalkthroughModule } from "@/lib/walkthroughs/registry";
import { walkthroughLength } from "@/lib/walkthroughs/progress";
import { useWalkthroughOptional } from "./walkthrough-context";

/* ════════════════════════════════════════════════════════════════
   THE TOUR BUTTON
   One button, and it always means "show me this page". On a surface with an
   authored walkthrough it opens that; elsewhere it opens the product tour,
   so the control never lies about what is behind it.
   ════════════════════════════════════════════════════════════════ */

export function TourLauncher({ variant = "pill" }: { variant?: "pill" | "icon" }) {
  const walkthrough = useWalkthroughOptional();
  const tour = useTour();

  const authored =
    walkthrough?.current && hasWalkthroughModule(walkthrough.current.id) ? walkthrough.current : null;
  const fresh = authored ? walkthrough?.state === "new" : tour.fresh;
  const label = authored ? `Walkthrough: ${authored.title}` : "Product tour";

  const onClick = () => {
    if (authored) walkthrough?.open(authored.id);
    else tour.open();
  };

  const warm = () => {
    if (authored) walkthrough?.prepare(authored.id);
    else tour.prepare();
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onClick}
        onPointerEnter={warm}
        onFocus={warm}
        aria-label={label}
        title={authored ? `${authored.title} · ${walkthroughLength(authored.seconds)}` : "Product tour"}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-line bg-card text-paper/70 transition hover:text-paper"
      >
        <Compass className="h-[18px] w-[18px]" aria-hidden />
        {fresh && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={warm}
      onFocus={warm}
      className={cn(
        "relative inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-card px-3.5 py-2 text-xs font-medium text-paper/75 shadow-soft transition hover:text-paper",
      )}
    >
      <Compass className="h-3.5 w-3.5 text-accent" aria-hidden />
      <span className="whitespace-nowrap">{authored ? "Walkthrough" : "Tour"}</span>
      {fresh && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
    </button>
  );
}
