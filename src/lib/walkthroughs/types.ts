/* ════════════════════════════════════════════════════════════════
   INTERACTIVE WALKTHROUGHS — THE SHAPES

   A walkthrough is an authored explanation of one entry surface: the page
   it belongs to, the steps it teaches, and the scene it draws while each
   step plays. The engine (components/walkthrough) only knows these types,
   so a new page is a new module here — never a branch inside the player.
   ════════════════════════════════════════════════════════════════ */

import type { ComponentType } from "react";

/** Every surface with — or awaiting — an authored walkthrough. */
export type WalkthroughId =
  | "capture"
  | "journal"
  | "goals"
  | "revision"
  | "habits"
  | "wellbeing"
  | "sleep"
  | "subjects"
  | "mocks"
  | "mistakes"
  | "current-affairs"
  | "books"
  | "roadmap"
  | "heatmap"
  | "knowledge-graph"
  | "performance-review"
  | "diary"
  | "announcements"
  | "settings"
  | "dashboard";

/** Where the caption sits relative to a lit element. */
export type StepPlacement = "top" | "bottom" | "left" | "right" | "center";

/**
 * One step of an authored walkthrough. The prose is written for the page it
 * belongs to — no step is generated from a template — and the scene that
 * plays beside it is authored in the same module.
 */
export interface WalkthroughStep {
  /** Stable id: progress survives a reworded step, and tests refer to it. */
  id: string;
  /** A short line, sentence case, no full stop. */
  title: string;
  /** What happens here, and why it matters. Two sentences at most. */
  body: string;
  /** Overline above the title, e.g. "Chapter 2 · The fields". */
  chapter?: string;
  /**
   * CSS selector for the real element to light up when the page is behind
   * the walkthrough. Absent means the stage plays alone, centred.
   */
  target?: string;
  /** Preferred caption side; the player flips it when space is short. */
  placement?: StepPlacement;
  /**
   * The data hand-off this step is explaining, when it has one. The player
   * prints it under the body; nothing is claimed that the code doesn't do.
   */
  connection?: string;
}

/**
 * One authored walkthrough. `Stage` is a small film per step — drawn with
 * the shared kit (components/walkthrough/demo-kit) so every scene feels part
 * of the same product, but written by hand for this page.
 */
export interface WalkthroughExperience {
  id: WalkthroughId;
  /**
   * Bumped only when the steps change materially. A finished walkthrough at
   * an older version is offered again; a finished one at this version is not.
   */
  version: number;
  /** Canonical route, or "capture" for the popup workspace. */
  path: string;
  /** Extra routes that open the same experience. */
  aliases?: readonly string[];
  title: string;
  /** One line, shown on the launcher and the opening card. */
  summary: string;
  /** Rough length, for "about a minute". */
  seconds: number;
  steps: readonly WalkthroughStep[];
  /** The authored scene for `steps[step]`. `playing` is false when paused. */
  Stage: ComponentType<{ step: number; playing: boolean }>;
}

/** What the launcher needs without loading an experience's bundle. */
export interface WalkthroughMeta {
  id: WalkthroughId;
  path: string;
  aliases?: readonly string[];
  title: string;
  summary: string;
  version: number;
  /** Declared step count; a test holds this equal to the authored steps. */
  steps: number;
  seconds: number;
}

/** Where a surface stands in this release. Kept honest; see docs. */
export type WalkthroughStatus = "authored" | "planned";
