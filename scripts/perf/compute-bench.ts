/* ════════════════════════════════════════════════════════════════
   HOW LONG THE PURE CALCULATIONS TAKE
   The app's derived figures (notifications, habits, the coach, reviews,
   the journal's analysis) are pure functions over the account's records.
   This times each one over the made-up accounts in dataset.ts, in Node
   on this machine, and repeats the persistence work the store does on
   every change (serialising the snapshot). A mid-range phone is roughly
   four times slower than a laptop core; the guide says how to read it.

       npx tsx scripts/perf/compute-bench.ts
   ════════════════════════════════════════════════════════════════ */

import { buildDataset, type DatasetName } from "./dataset";
import { evaluate, buildInbox, DEFAULT_NOTIFY_SETTINGS, EMPTY_NOTIFY_STATE } from "../../src/lib/notifications";
import { habitContext, todayHabits, summarizeToday, habitsOverPeriod } from "../../src/lib/habit-engine";
import { buildRecommendations, buildBriefing, buildAnalysis, coachDataOf, visibleRecommendations } from "../../src/lib/coach";
import { measurePeriod, recentPeriods, periodTrend } from "../../src/lib/performance";
import { buildLifeReport, factorLinks, presetSpan, trackedFields } from "../../src/lib/life";
import { sleepNights } from "../../src/lib/sleep";
import { analyseJournal } from "../../src/lib/journal-analysis";
import { buildMentorContext } from "../../src/lib/mentor";
import { buildHeatmap, currentStreak } from "../../src/lib/selectors";
import { toISODate } from "../../src/lib/utils";
import type { ChronicleData } from "../../src/lib/types";

function time(fn: () => unknown, rounds = 15): number {
  fn();
  const samples: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const t = performance.now();
    fn();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  return Math.round(samples[Math.floor(samples.length / 2)] * 100) / 100;
}

const today = toISODate(new Date());
const now = new Date();
const rows: Record<string, Record<string, number>> = {};

for (const name of ["typical", "heavy"] as DatasetName[]) {
  const data = buildDataset(name, now) as unknown as ChronicleData;
  const r: Record<string, number> = {};
  const json = JSON.stringify({ state: data, version: 17 });
  r["snapshot KB"] = Math.round(json.length / 1024);
  const span = presetSpan("90d", today);
  const tracked = trackedFields(data.profile.lifeFields, data.lifeLog);
  r["Life: 90-day report and associations"] = time(() => {
    buildLifeReport({ journal: data.journal, lifeLog: data.lifeLog, span, tracked });
    factorLinks(data.lifeLog, data.journal, span, tracked);
  });
  const sleepRows = data.lifeLog
    .filter((entry) => entry.date >= span.from && entry.date <= span.to)
    .map((entry) => ({ ...entry, bedtime: "23:30", wakeTime: "07:00", sleepTimezone: "America/New_York" }));
  r["Life: 90-day sleep timeline"] = time(() => sleepNights(sleepRows));
  r["JSON.stringify (persist write)"] = time(() => JSON.stringify({ state: data, version: 17 }));
  r["JSON.parse (rehydrate)"] = time(() => JSON.parse(json));
  r["notifications: evaluate + inbox"] = time(() =>
    buildInbox(evaluate(data, { now, settings: DEFAULT_NOTIFY_SETTINGS }), EMPTY_NOTIFY_STATE, today),
  );
  r["habits: context (activity layer)"] = time(() => habitContext(data, today));
  const ctx = habitContext(data, today);
  r["habits: today + summary"] = time(() => summarizeToday(todayHabits(data.habits, ctx)));
  r["habits: 90-day consistency"] = time(() => habitsOverPeriod(data.habits, ctx, toISODate(new Date(Date.now() - 89 * 864e5)), today));
  const coach = coachDataOf(data);
  r["coach: recommendations"] = time(() => buildRecommendations(coach, today));
  const recs = visibleRecommendations(buildRecommendations(coach, today), data.coach).shown;
  r["coach: briefing"] = time(() => buildBriefing(coach, recs, today));
  r["coach: analysis"] = time(() => buildAnalysis(coach, today));
  r["mentor context"] = time(() => buildMentorContext(data, today));
  const week = recentPeriods("Weekly", today, 1)[0];
  r["review: measure a week"] = time(() => measurePeriod(data, week, today));
  r["review: 8-week trend"] = time(() => periodTrend(data, "Weekly", today, 8));
  r["journal analysis (by week)"] = time(() => analyseJournal(data.journal, data.subjects, "week", now));
  r["heatmap + streak"] = time(() => {
    buildHeatmap(data.journal, 53);
    currentStreak(data.journal);
  });
  rows[name] = r;
}

const names = Object.keys(rows.typical);
console.log(`| Calculation | typical | heavy |`);
console.log(`| --- | ---: | ---: |`);
for (const n of names) console.log(`| ${n} | ${rows.typical[n]} | ${rows.heavy[n]} |`);
console.log(`\nTimes are medians in milliseconds, Node ${process.version}, one core of this machine.`);
