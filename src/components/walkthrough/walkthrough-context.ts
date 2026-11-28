"use client";

import { createContext, useContext } from "react";
import type { WalkthroughId, WalkthroughMeta } from "@/lib/walkthroughs/types";
import type { WalkthroughState } from "@/lib/walkthroughs/progress";

/* ════════════════════════════════════════════════════════════════
   WALKTHROUGH CONTEXT
   What the rest of the app may ask of the player: open this surface's
   walkthrough, warm it up for the button, or say where this account stands.
   The provider owns the state; nothing else does.
   ════════════════════════════════════════════════════════════════ */

export interface WalkthroughContextValue {
  /** Opens a walkthrough; defaults to the one for the current route. */
  open: (id?: WalkthroughId) => void;
  /** Starts a walkthrough again from its first step, even if finished. */
  replay: (id?: WalkthroughId) => void;
  /** Closes without finishing; the step reached is remembered. */
  close: () => void;
  /** Downloads the selected experience ahead of the tap. */
  prepare: (id?: WalkthroughId) => void;
  /** True while the player is over the app. */
  isOpen: boolean;
  /** The walkthrough for the current route, when the catalog has one. */
  current: WalkthroughMeta | null;
  /** How this account stands on the current route's walkthrough. */
  state: WalkthroughState;
  /** Opens the capture workspace's walkthrough (the popup is not a route). */
  openCapture: () => void;
}

export const WalkthroughContext = createContext<WalkthroughContextValue | null>(null);

export function useWalkthrough(): WalkthroughContextValue {
  const ctx = useContext(WalkthroughContext);
  if (!ctx) throw new Error("useWalkthrough must be used within a WalkthroughProvider");
  return ctx;
}

/** True inside a provider; for chrome that renders above and below the shell. */
export function useWalkthroughOptional(): WalkthroughContextValue | null {
  return useContext(WalkthroughContext);
}
