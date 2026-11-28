/* ════════════════════════════════════════════════════════════════
   THE CATALOG
   Metadata for every walkthrough, so the top bar can name the one for the
   current page, the launcher can show its length, and an audit can list
   what is authored and what is still planned — without downloading any
   experience's bundle. The steps themselves live in ./experiences.
   ════════════════════════════════════════════════════════════════ */

import type { WalkthroughId, WalkthroughMeta } from "./types";

/**
 * The surfaces this release teaches, in navigation order. `version` moves
 * only when the steps change materially; a finished walkthrough at an older
 * version is offered again, so no one is left with an outdated explanation.
 */
export const WALKTHROUGH_CATALOG: readonly WalkthroughMeta[] = [
  {
    id: "capture",
    path: "capture",
    title: "Daily Capture",
    summary: "One popup that turns today into a record — the day, how you felt, your goals and your habits.",
    version: 1,
    steps: 8,
    seconds: 95,
  },
  {
    id: "journal",
    path: "/journal",
    aliases: ["/journal/history"],
    title: "Study Journal",
    summary: "A daily entry that feeds your revision queue, your confidence and your heatmap.",
    version: 1,
    steps: 6,
    seconds: 80,
  },
  {
    id: "goals",
    path: "/goals",
    title: "Goals",
    summary: "From a large goal to today's measurable amount, with progress that updates itself.",
    version: 1,
    steps: 6,
    seconds: 75,
  },
  {
    id: "revision",
    path: "/revision",
    title: "Revision",
    summary: "Spaced repetition that reads your own recall — and what each answer changes.",
    version: 1,
    steps: 6,
    seconds: 85,
  },
  {
    id: "habits",
    path: "/habits",
    title: "Habits",
    summary: "A weekly cadence with a log per day, and the streaks that follow from it.",
    version: 1,
    steps: 6,
    seconds: 70,
  },
  {
    id: "subjects",
    path: "/subjects",
    title: "Subjects & Syllabus",
    summary: "The syllabus tree, confidence per topic, and how every other page reads it.",
    version: 1,
    steps: 6,
    seconds: 80,
  },
] as const;

/** Surfaces planned for a later release. Listed so the gap stays visible. */
export const PLANNED_WALKTHROUGHS: readonly { path: string; title: string }[] = [
  { path: "/wellbeing", title: "Wellbeing" },
  { path: "/mocks", title: "Mock Tests" },
  { path: "/mistakes", title: "Mistakes" },
  { path: "/current-affairs", title: "Current Affairs" },
  { path: "/books", title: "Books" },
  { path: "/roadmap", title: "Roadmap" },
  { path: "/heatmap", title: "Consistency Heatmap" },
  { path: "/knowledge-graph", title: "Knowledge Graph" },
  { path: "/performance-review", title: "Performance Review" },
  { path: "/diary", title: "Diary" },
  { path: "/announcements", title: "Announcements" },
  { path: "/settings", title: "Settings" },
] as const;

const byId = new Map(WALKTHROUGH_CATALOG.map((entry) => [entry.id, entry]));

export function walkthroughMeta(id: WalkthroughId): WalkthroughMeta | undefined {
  return byId.get(id);
}

/** `/journal/today` and `/journal` both mean the journal, but `/journalx` does not. */
function pathMatches(pathname: string, route: string): boolean {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return clean === route || clean.startsWith(`${route}/`);
}

/**
 * The walkthrough for a route. The capture popup is not a route, so it asks
 * for its id directly; every page asks by pathname.
 */
export function walkthroughForPath(pathname: string): WalkthroughMeta | undefined {
  const matches = WALKTHROUGH_CATALOG.filter((entry) =>
    entry.path.startsWith("/") && pathMatches(pathname, entry.path),
  );
  if (matches.length) {
    // The longest route wins: /wellbeing/mood belongs to /wellbeing, and a
    // more specific route (if one is ever added) beats its parent.
    return matches.sort((a, b) => b.path.length - a.path.length)[0];
  }
  return WALKTHROUGH_CATALOG.find(
    (entry) => entry.aliases?.some((alias) => pathMatches(pathname, alias)) ?? false,
  );
}
