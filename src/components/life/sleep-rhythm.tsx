import { useMemo, useState } from "react";
import { Moon, Sunrise, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MAX_SLEEP_HOURS, bedDateFor, clockDelta, clockMinutes, formatClock, formatDuration, sleepNights } from "@/lib/sleep";
import type { LifeEntry, SleepTarget, TimeFormat } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import type { DateSpan } from "@/lib/life";

const axisStart = 18 * 60;
const axisLength = 24 * 60;
const percent = (min: number) => `${Math.min(100, Math.max(0, (min - axisStart) / axisLength * 100))}%`;

export function SleepRhythm({ lifeLog, span, format, target, onEdit }: {
  lifeLog: LifeEntry[];
  span: DateSpan;
  format: TimeFormat;
  target?: SleepTarget;
  onEdit: (date: string) => void;
}) {
  const nights = useMemo(() => sleepNights(lifeLog.filter((entry) =>
    entry.date >= span.from && entry.date <= span.to,
  )).sort((a, b) => b.date.localeCompare(a.date)), [lifeLog, span]);
  const [limit, setLimit] = useState(7);
  const reported = useMemo(() => nights.flatMap((night) =>
    night.hours != null && night.hours > 0 && night.hours <= MAX_SLEEP_HOURS &&
    (night.manualHours || night.timesMinutes == null) ? [night.hours] : [],
  ), [nights]);
  const reportedMean = reported.length ? reported.reduce((sum, hours) => sum + hours, 0) / reported.length : null;
  const targetBed = clockMinutes(target?.bedtime);
  const targetWake = clockMinutes(target?.wakeTime);
  const adherence = useMemo(() => {
    const results = { recorded: 0, met: 0 };
    if (!target?.bedtime || !target.wakeTime) return results;
    for (const night of nights) {
      if (!night.bedtime || !night.wakeTime || night.timesMinutes == null || night.timesMinutes > MAX_SLEEP_HOURS * 60) continue;
      results.recorded++;
      if (Math.abs(clockDelta(night.bedtime, target.bedtime)) <= 30 &&
          Math.abs(clockDelta(night.wakeTime, target.wakeTime)) <= 30) results.met++;
    }
    return results;
  }, [nights, target]);
  const targetStart = targetBed == null ? null : targetBed < axisStart ? targetBed + 1440 : targetBed;
  const targetEnd = targetWake == null ? null : targetWake + 1440;

  return (
    <Card className="overflow-hidden p-4 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><Moon className="h-5 w-5" aria-hidden /></span>
        <div>
          <h3 className="font-display text-lg font-bold text-paper">Sleep rhythm</h3>
          <p className="text-xs text-paper/65">{nights.length} recorded {nights.length === 1 ? "night" : "nights"} · {formatDate(span.from)} – {formatDate(span.to)}</p>
        </div>
      </div>
      <p className="mb-3 text-sm text-paper/75">
        {reportedMean == null ? "No separate actual-sleep readings in this period."
          : `${formatDuration(Math.round(reportedMean * 60))} average reported asleep · ${reported.length} of ${nights.length} recorded nights`}
      </p>
      {adherence.recorded > 0 && <p className="mb-3 text-sm font-medium text-paper">
        {adherence.met} of {adherence.recorded} nights with both times recorded landed within 30 minutes of both targets.
      </p>}
      {nights.length === 0 ? <p className="rounded-xl border border-dashed border-line p-4 text-sm text-paper/65">Record a bedtime or wake-up to see it on the timeline.</p> : (
        <>
          <p className="mb-3 text-xs text-paper/65">Bars show time in bed on a 6 PM to 6 PM local clock. Exact times are listed above each bar.{targetStart != null && targetEnd != null && targetStart < targetEnd ? " The shaded band is your target." : ""}</p>
          <div className="mb-2 flex justify-between text-xs text-paper/65" aria-hidden>
            {[1080, 0, 360, 720, 1080].map((m, idx) => <span key={idx}>{formatClock(`${String(m / 60).padStart(2, "0")}:00`, format)}</span>)}
          </div>
          <ul className="divide-y divide-line">
            {nights.slice(0, limit).map((night) => {
              const bed = clockMinutes(night.bedtime);
              const wake = clockMinutes(night.wakeTime);
              const start = bed == null ? null : night.bedtime && night.wakeTime
                ? bed + (bedDateFor(night.date, night.bedtime, night.wakeTime) === night.date ? 1440 : 0)
                : bed + (bed < 720 ? 1440 : 0);
              const end = wake == null ? null : wake + 1440;
              const interval = start != null && end != null && start < end && night.timesMinutes != null && night.timesMinutes <= MAX_SLEEP_HOURS * 60;
              return (
                <li key={night.date} className="space-y-2 py-3">
                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs">
                    <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-md font-semibold text-paper hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={() => onEdit(night.date)} aria-label={`Edit recordings for ${formatDate(night.date)}`}><Pencil className="h-3 w-3" aria-hidden />{formatDate(night.date)}</button>
                    <span className="inline-flex flex-wrap items-center gap-2 text-paper/70">
                      <Moon className="h-3 w-3" aria-label="Bedtime" /> {night.bedtime ? formatClock(night.bedtime, format) : "Unrecorded"}
                      <Sunrise className="h-3 w-3" aria-label="Wake-up" /> {night.wakeTime ? formatClock(night.wakeTime, format) : "Unrecorded"}
                    </span>
                  </div>
                  <div className="relative h-3 rounded-full bg-paper/[0.06]" aria-hidden>
                    {targetStart != null && targetEnd != null && targetStart < targetEnd && <span className="absolute inset-y-0 rounded-full bg-accent/15" style={{ left: percent(targetStart), right: `calc(100% - ${percent(targetEnd)})` }} />}
                    {interval ? <span className="absolute inset-y-0.5 min-w-1 rounded-full bg-accent" style={{ left: percent(start), right: `calc(100% - ${percent(end)})` }} />
                      : [start, end].map((point, idx) => point == null ? null : <span key={idx} className="absolute inset-y-0.5 w-1 -translate-x-1/2 rounded-full bg-accent" style={{ left: percent(point) }} />)}
                  </div>
                  {interval && night.timesMinutes != null && <p className="text-xs text-paper/65">
                    {formatDuration(night.timesMinutes)} in bed{night.manualHours && night.hours != null ? ` · ${formatDuration(Math.round(night.hours * 60))} reported asleep` : ""}
                  </p>}
                </li>
              );
            })}
          </ul>
          {nights.length > limit && <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + 7)}>Show earlier nights</Button>}
        </>
      )}
    </Card>
  );
}
