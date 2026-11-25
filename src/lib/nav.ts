import {
  LayoutDashboard,
  NotebookPen,
  Route,
  Newspaper,
  Repeat,
  TriangleAlert,
  Flame,
  Layers,
  BarChart3,
  Network,
  CalendarCheck,
  BookLock,
  ListChecks,
  Target,
  BookOpen,
  Sparkles,
  HeartPulse,
  Moon,
  Footprints,
  Scale,
  Smartphone,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  short: string; // for command palette keyword / tooltip
  /** A one-word name for tight spaces (the phone's bottom bar). */
  tab?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /** Drawn larger, as tiles, at the top of the sidebar. */
  prominent?: boolean;
}

/**
 * The four sections used every day. They lead the sidebar as tiles and make
 * up the frequently used destinations in the sidebar.
 */
export const essentialNavItems: NavItem[] = [
  { label: "Daily Journal", href: "/journal", icon: NotebookPen, short: "Browse daily records, topics and analysis", tab: "Journal" },
  { label: "Goals", href: "/goals", icon: Target, short: "What you're chasing", tab: "Goals" },
  {
    label: "Life Dashboard",
    href: "/wellbeing",
    icon: HeartPulse,
    short: "Sleep, movement, reports & patterns",
    tab: "Life",
  },
  { label: "Revision", href: "/revision", icon: Repeat, short: "Spaced repetition", tab: "Revision" },
];

export const navGroups: NavGroup[] = [
  { label: "Essentials", items: essentialNavItems, prominent: true },
  {
    label: "Home and planning",
    items: [
      { label: "Home", href: "/dashboard", icon: LayoutDashboard, short: "Daily priorities and overview" },
      { label: "Roadmap", href: "/roadmap", icon: Route, short: "Yearly, monthly and weekly plans" },
      { label: "Study Coach", href: "/coach", icon: Sparkles, short: "Briefing and suggestions" },
    ],
  },
  {
    label: "Study tools",
    items: [
      { label: "Subject Progress", href: "/subjects", icon: Layers, short: "Syllabus mastery" },
      { label: "Current Affairs", href: "/current-affairs", icon: Newspaper, short: "News vault" },
      { label: "Mistake Tracker", href: "/mistakes", icon: TriangleAlert, short: "Learn from errors" },
      { label: "Library", href: "/books", icon: BookOpen, short: "Book progress" },
      { label: "Knowledge Graph", href: "/knowledge-graph", icon: Network, short: "Connected concepts" },
    ],
  },
  {
    label: "Habits and personal",
    items: [
      { label: "My Habits", href: "/habits", icon: ListChecks, short: "Track your habits" },
      { label: "Personal Diary", href: "/diary", icon: BookLock, short: "Private writing" },
    ],
  },
  {
    label: "Analytics and reviews",
    items: [
      { label: "Study Heatmap", href: "/heatmap", icon: Flame, short: "Consistency map" },
      { label: "Mock Analytics", href: "/mocks", icon: BarChart3, short: "Test performance" },
      { label: "Performance Review", href: "/performance-review", icon: CalendarCheck, short: "Review a study period" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Settings", href: "/settings", icon: Settings, short: "Profile, exam, appearance, data & account" },
    ],
  },
];

/**
 * The four life metrics that have a page of their own. These are deliberately
 * kept out of `navGroups` — four more rows would crowd the sidebar — but they
 * still belong in the command palette, so that "running" or "weight" typed into
 * ⌘K goes straight there.
 */
export const metricNavItems: NavItem[] = [
  { label: "Sleep", href: "/wellbeing/sleep", icon: Moon, short: "Every night, hours & quality over time" },
  { label: "Running", href: "/wellbeing/running", icon: Footprints, short: "Distance run by day, week, month, year" },
  { label: "Weight", href: "/wellbeing/weight", icon: Scale, short: "Weight trend and seven-day average" },
  { label: "Screen time", href: "/wellbeing/screen", icon: Smartphone, short: "Where the hours leak" },
];

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);

/** Everything the command palette should be able to reach. */
export const searchableNavItems: NavItem[] = [...allNavItems, ...metricNavItems];

export function findNavItem(pathname: string): NavItem | undefined {
  return allNavItems.find((i) => isActivePath(pathname, i.href));
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
