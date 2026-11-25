/* ════════════════════════════════════════════════════════════════
   OPEN SOURCE
   The code behind DoOrDie is public on GitHub. The site header says so,
   and links to the repository, so a visitor can read the code, star it
   or report a problem. A server component: it is plain HTML, with
   nothing to download.
   ════════════════════════════════════════════════════════════════ */

import { ExternalLink } from "lucide-react";

/** The public repository. */
export const REPO_URL = "https://github.com/amanjaiman1/OPCivilService";

/** GitHub's mark, drawn inline: lucide-react ships no brand icons. */
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/**
 * "Open source" in the site header: a pill beside the other actions on a
 * desktop (`button`), or a row with a line of explanation in the phone's
 * menu (`menu`).
 */
export function OpenSourceLink({ variant = "button" }: { variant?: "button" | "menu" }) {
  if (variant === "menu") {
    return (
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-track="github_header"
        className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-paper/[0.06]"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent" aria-hidden>
          <GitHubMark className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-paper">Open source on GitHub</span>
          <span className="block text-xs leading-relaxed text-paper/55">
            DoOrDie is open source: its code is public. Read it, star it, or report a problem.
          </span>
        </span>
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-paper/40" aria-hidden />
      </a>
    );
  }

  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-track="github_header"
      title="DoOrDie is open source. Read the code on GitHub."
      className="lg-clear inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold tracking-snugg text-paper/80 transition-all hover:text-paper"
    >
      <GitHubMark className="h-4 w-4" />
      Open source
    </a>
  );
}
