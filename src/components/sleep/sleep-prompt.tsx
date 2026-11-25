"use client";

import { useChronicle } from "@/lib/store";
import { Logo } from "@/components/layout/logo";
import { nightLabel } from "@/lib/sleep";
import { toISODate } from "@/lib/utils";
import { SleepEditor } from "./sleep-editor";
import { FullScreen } from "./sleep-gate";

/* The morning check-in itself, downloaded only on the mornings it is
   shown: on every other open of the app, the gate lets the page through and
   this code (with the time picker it uses) never loads. */

/** Friendly greeting based on the current hour. */
function greeting(hour: number): string {
  if (hour < 5) return "Up early";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The morning check-in: last night's bedtime and wake-up, before the day
 * starts. If you tapped "going to bed now" last night, only the wake-up is
 * left, and one tap answers it. It can be skipped; the Life Dashboard has
 * the same card any time.
 */
export function SleepPrompt({ promptKey }: { promptKey: string }) {
  const dismissSleepPrompt = useChronicle((s) => s.dismissSleepPrompt);
  const today = toISODate(new Date());
  const hour = new Date().getHours();

  return (
    <FullScreen>
      <div
        className="w-full max-w-lg rounded-3xl border border-line bg-card p-5 shadow-lift sm:p-7"
        data-testid="sleep-prompt"
        role="region"
        aria-labelledby="sleep-prompt-title"
      >
        <div className="flex flex-col items-center text-center">
          <Logo className="h-9 w-9" />
          <h1 id="sleep-prompt-title" className="mt-4 font-display text-2xl font-bold tracking-tightest text-paper">
            {greeting(hour)}. How did you sleep?
          </h1>
          <p className="mt-1 text-sm text-paper/60">The night of {nightLabel(today)}</p>
        </div>

        <div className="mt-6">
          <SleepEditor date={today} variant="gate" promptKey={promptKey} />
        </div>

        <div className="mt-4 flex flex-col items-center gap-1 text-center">
          <button
            type="button"
            onClick={() => dismissSleepPrompt(promptKey)}
            className="rounded-full px-3 py-1.5 text-[0.8rem] font-semibold text-paper/60 hover:text-paper"
          >
            Skip for today
          </button>
          <p className="text-[0.7rem] text-paper/45">You can record or change it any time on the Life Dashboard.</p>
        </div>
      </div>
    </FullScreen>
  );
}
