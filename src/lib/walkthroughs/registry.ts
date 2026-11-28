/* ════════════════════════════════════════════════════════════════
   THE REGISTRY
   The one place that knows which module draws which walkthrough. Imports
   are lazy: opening the journal downloads the journal's film, not every
   page's. The catalog stays metadata-only, so the top bar never pays for
   a stage it isn't showing.
   ════════════════════════════════════════════════════════════════ */

import type { WalkthroughExperience, WalkthroughId } from "./types";

type Loader = () => Promise<{ default: WalkthroughExperience }>;

/**
 * Only authored experiences are listed. An id with no entry has no
 * walkthrough yet — the launcher says so plainly rather than showing a
 * generic placeholder that teaches nothing about the page.
 */
const LOADERS: Partial<Record<WalkthroughId, Loader>> = {
  capture: () => import("@/components/walkthrough/experiences/capture"),
  journal: () => import("@/components/walkthrough/experiences/journal"),
  goals: () => import("@/components/walkthrough/experiences/goals"),
  revision: () => import("@/components/walkthrough/experiences/revision"),
  habits: () => import("@/components/walkthrough/experiences/habits"),
  subjects: () => import("@/components/walkthrough/experiences/subjects"),
};

const cache = new Map<WalkthroughId, WalkthroughExperience>();

/**
 * Loads (once) the authored walkthrough for an id. An id without a module,
 * or a module that fails to load, resolves to `null` — the page keeps
 * working and the launcher simply has nothing to offer.
 */
export async function loadWalkthrough(id: WalkthroughId): Promise<WalkthroughExperience | null> {
  const cached = cache.get(id);
  if (cached) return cached;
  const loader = LOADERS[id];
  if (!loader) return null;
  try {
    const mod = await loader();
    cache.set(id, mod.default);
    return mod.default;
  } catch {
    return null;
  }
}

export function hasWalkthroughModule(id: WalkthroughId): boolean {
  return Boolean(LOADERS[id]);
}

/** Test seam: lets a test load without the bundler. */
export function primeWalkthrough(experience: WalkthroughExperience): void {
  cache.set(experience.id, experience);
}
