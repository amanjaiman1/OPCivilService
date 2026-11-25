"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, BedDouble, Check, ChevronDown, Moon, Sunrise, Trash2, TriangleAlert, X } from "lucide-react";
import type { ISODate, SleepTarget, TimeFormat } from "@/lib/types";
import { useChronicle } from "@/lib/store";
import { useNow } from "@/lib/hooks";
import {
  MAX_SLEEP_HOURS,
  bedDateFor,
  bedtimeNowNight,
  checkSleep,
  clockDelta,
  clockMinutes,
  clockNow,
  formatClock,
  formatDuration,
  nightLabel,
  nightOf,
  shortDay,
  targetMinutes,
  timeFormatOf,
  usualClock,
  type SleepCheck,
} from "@/lib/sleep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { zonedNow } from "@/lib/zoned-time";
import { cn, fromISODate, toISODate } from "@/lib/utils";
import { TimeField, type TimeChip } from "./time-field";

function dayBefore(date: ISODate): ISODate {
  const d = fromISODate(date);
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}

/** The day a bedtime falls on, also while the wake-up is still blank. */
function bedDay(date: ISODate, bedtime: string, wakeTime: string): ISODate {
  if (bedtime && wakeTime) return bedDateFor(date, bedtime, wakeTime);
  // Without a wake-up, an evening bedtime is the night before and a small-hours one the same day.
  const m = clockMinutes(bedtime);
  return m != null && m < 12 * 60 ? date : dayBefore(date);
}

/** How the night compares with the target, in plain words. */
function targetNote(check: SleepCheck, bedtime: string, target: SleepTarget | undefined, format: TimeFormat): string | null {
  if (!target) return null;
  const parts: string[] = [];
  const aim = targetMinutes(target);
  if (aim != null && check.ok) {
    const diff = check.minutes - aim;
    if (Math.abs(diff) <= 10) parts.push(`right on your ${formatDuration(aim)} aim`);
    else parts.push(`${formatDuration(Math.abs(diff))} ${diff < 0 ? "short of" : "over"} your ${formatDuration(aim)} aim`);
  }
  if (target.bedtime && bedtime) {
    const d = clockDelta(bedtime, target.bedtime);
    if (Math.abs(d) > 10) parts.push(`bed ${formatDuration(Math.abs(d))} ${d > 0 ? "later" : "earlier"} than ${formatClock(target.bedtime, format)}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Bedtime and wake-up side by side, and how long that is, worked out as you
 * pick. The bedtime's day is shown rather than asked for: it is always the
 * one that makes the night less than a day long.
 */
export function SleepTimes({
  date,
  bedtime,
  wakeTime,
  onBedtime,
  onWakeTime,
  format,
  bedChips,
  wakeChips,
  target,
  compact = false,
  morning = false,
  timezone,
}: {
  date: ISODate;
  bedtime: string;
  wakeTime: string;
  onBedtime: (v: string) => void;
  onWakeTime: (v: string) => void;
  format: TimeFormat;
  bedChips?: TimeChip[];
  wakeChips?: TimeChip[];
  target?: SleepTarget;
  compact?: boolean;
  morning?: boolean;
  timezone?: string;
}) {
  const check = checkSleep(date, bedtime, wakeTime, timezone);
  const note = targetNote(check, bedtime, target, format);
  const night = nightLabel(date);

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-3">
        <TimeField
          label={morning ? "Last night · Went to bed" : "Went to bed"}
          icon={Moon}
          context="bed"
          size={compact ? "md" : undefined}
          value={bedtime}
          onChange={onBedtime}
          format={format}
          dayLabel={shortDay(bedDay(date, bedtime, wakeTime))}
          sheetDescription={`The night of ${night}`}
          chips={bedChips}
        />
        <ArrowRight className={cn("h-4 w-4 shrink-0 text-paper/45", compact ? "mt-8" : "mt-11")} aria-hidden />
        <TimeField
          label={morning ? "Today morning · Woke up" : "Woke up"}
          icon={Sunrise}
          context="wake"
          size={compact ? "md" : undefined}
          value={wakeTime}
          onChange={onWakeTime}
          format={format}
          dayLabel={shortDay(date)}
          sheetDescription={`The night of ${night}`}
          chips={wakeChips}
        />
      </div>

      {(!compact || bedtime || wakeTime) && <div
        className={cn(
          compact ? "rounded-xl border px-3 py-2" : "flex min-h-[3.25rem] flex-col items-center justify-center rounded-2xl border px-4 py-2.5 text-center",
          check.ok
            ? check.level === "ok"
              ? "border-accent/25 bg-accent/[0.06]"
              : "border-warning/30 bg-warning/[0.07]"
            : check.reason === "missing"
              ? "border-dashed border-paper/15"
              : "border-danger/30 bg-danger/[0.06]",
        )}
        aria-live="polite"
        data-testid="sleep-duration"
      >
        {check.ok ? (
          <>
            <p className="text-sm text-paper/75">
              <span className="tabular font-display text-xl font-bold tracking-tightest text-paper">{formatDuration(check.minutes)}</span> in bed
            </p>
            {check.message && (
              <p className="mt-0.5 flex items-center gap-1 text-[0.72rem] text-warning">
                <TriangleAlert className="h-3 w-3" /> {check.message}
              </p>
            )}
            {note && <p className="mt-0.5 text-[0.72rem] text-paper/60">{note}</p>}
          </>
        ) : check.reason === "missing" ? (
          <p className="text-[0.78rem] text-paper/55">
            {bedtime && !wakeTime
              ? `In bed from ${formatClock(bedtime, format)}. Add the wake-up when you're up.`
              : wakeTime && !bedtime
                ? "Add your bedtime to calculate time in bed."
                : check.message}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-[0.78rem] font-medium text-danger" role="alert">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {check.message}
          </p>
        )}
      </div>}
      {!check.ok && note && <p className="text-xs text-paper/65">{note}</p>}
    </div>
  );
}

function QualityPicker({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <div>
      <p className="mb-2 text-[0.75rem] font-semibold text-paper/65">How well you slept</p>
      <div className="flex items-center gap-1" role="group" aria-label="Sleep quality, 1 to 5">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(value === v ? undefined : v)}
            aria-pressed={value === v}
            aria-label={`Sleep quality ${v} of 5`}
            className={cn(
              "h-9 flex-1 rounded-xl border text-xs font-semibold transition-all",
              value != null && v <= value
                ? "border-accent bg-accent text-accent-fg"
                : "field border-line bg-paper/[0.03] text-paper/60 hover:border-paper/25 hover:text-paper",
            )}
          >
            {v}
          </button>
        ))}
        {value != null && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label="Clear sleep quality"
            className="grid h-9 w-8 shrink-0 place-items-center rounded-xl text-paper/50 hover:text-paper"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="mt-1 text-[0.7rem] text-paper/50">{value == null ? "Not rated" : "1 poor · 5 great. Tap again to clear."}</p>
    </div>
  );
}

interface Form {
  bedtime: string;
  wakeTime: string;
  quality?: number;
  /** Time asleep typed by hand, in hours; empty means bedtime to wake-up. */
  asleep: string;
}

/**
 * Records or edits one night. Every reading on the same Life Dashboard day
 * other than sleep is left as it is.
 *
 * `variant`: `card` sits in the Life Dashboard card, `sheet` in a dialog,
 * `gate` in the morning check-in (saving also marks the check-in answered).
 */
export function SleepEditor({
  date,
  variant = "card",
  promptKey,
  onSaved,
  onDeleted,
}: {
  date: ISODate;
  variant?: "card" | "sheet" | "gate";
  promptKey?: string;
  onSaved?: () => void;
  onDeleted?: () => void;
}) {
  const entry = useChronicle((s) => s.lifeLog.find((l) => l.date === date));
  const lifeLog = useChronicle((s) => s.lifeLog);
  const profile = useChronicle((s) => s.profile);
  const recordSleep = useChronicle((s) => s.recordSleep);
  const clearSleep = useChronicle((s) => s.clearSleep);
  const confirm = useConfirm();
  const now = useNow();
  const today = toISODate(now);
  const format = timeFormatOf(profile);
  const night = entry ? nightOf(entry) : null;
  const asleepId = useId();
  const timezone = entry?.sleepTimezone;

  const initial: Form = useMemo(() => {
    const current = new Date();
    const nightClock = zonedNow(timezone, current);
    const suggestedWake = variant === "gate" && date === today && toISODate(nightClock) === date &&
      current.getHours() < 15 ? clockNow(nightClock) : "";
    return {
      bedtime: night?.bedtime ?? "",
      wakeTime: night?.wakeTime ?? suggestedWake,
      quality: night?.quality,
      asleep: night && night.hours != null && (night.manualHours || night.timesMinutes == null) ? String(night.hours) : "",
    };
    // The fields are keyed to the saved values. The suggestion stays fixed as the user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, today, timezone, variant, night?.bedtime, night?.wakeTime, night?.quality, night?.hours, night?.manualHours, night?.timesMinutes]);
  const [form, setForm] = useState<Form>(initial);
  const [more, setMore] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Another night: start from what it has. The same night saved elsewhere
  // (another device, the quick buttons): follow it, unless you're mid-edit.
  useEffect(() => {
    setForm(initial);
    setError(null);
    setMore(initial.quality != null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  useEffect(() => {
    if (!dirtyRef.current) setForm(initial);
  }, [initial]);

  const check = checkSleep(date, form.bedtime, form.wakeTime, timezone);
  const isTonight = date > today;
  const nowClock = clockNow(now);
  const usualBed = usualClock(lifeLog, "bedtime", date);
  const usualWake = usualClock(lifeLog, "wakeTime", date);
  const bedChips: TimeChip[] = [
    ...(isTonight || (date === today && now.getHours() < 4) ? [{ label: "Now", value: nowClock }] : []),
    ...(usualBed ? [{ label: "Usual", value: usualBed }] : []),
  ];
  const wakeChips: TimeChip[] = [
    // "Now" is a wake-up only during waking hours; at 8 PM it isn't last night's.
    ...(date === today && now.getHours() >= 3 && now.getHours() < 15 && toISODate(zonedNow(timezone, now)) === date ? [{ label: "Now", value: clockNow(zonedNow(timezone, now)) }] : []),
    ...(usualWake ? [{ label: "Usual", value: usualWake }] : []),
  ];

  function patch(p: Partial<Form>) {
    setForm((f) => ({ ...f, ...p }));
    setSaved(false);
    setError(null);
  }

  function save() {
    const both = Boolean(form.bedtime && form.wakeTime);
    if (both && !check.ok) {
      setError(check.message);
      return;
    }
    if (form.wakeTime && date > today) {
      setError("A wake-up can't be in the future.");
      return;
    }
    let asleep: number | undefined;
    if (form.asleep.trim()) {
      asleep = Number(form.asleep);
      if (!Number.isFinite(asleep) || asleep < 0.25 || asleep > MAX_SLEEP_HOURS) {
        setError(`Time asleep is between 0.25 and ${MAX_SLEEP_HOURS} hours.`);
        return;
      }
    }
    if (asleep != null && check.ok && Math.round(asleep * 60) > check.minutes && (form.asleep !== initial.asleep || form.bedtime !== initial.bedtime || form.wakeTime !== initial.wakeTime)) {
      setError("Actual sleep cannot exceed time in bed.");
      return;
    }
    if (!form.bedtime && !form.wakeTime && asleep == null && form.quality == null) {
      setError(night ? "Nothing left to save. Use Delete to remove this night." : "Set a bedtime or a wake-up first.");
      return;
    }
    recordSleep({
      date,
      bedtime: form.bedtime || null,
      wakeTime: form.wakeTime || null,
      // Hours typed by hand win; otherwise they follow the times. Clearing a
      // typed value on a night without both times clears the hours too.
      hours: asleep ?? (both ? undefined : initial.asleep ? null : undefined),
      deriveHours: both && asleep == null,
      quality: form.quality ?? null,
      promptKey: variant === "gate" ? promptKey : undefined,
    });
    setSaved(true);
    onSaved?.();
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete this night's sleep?",
      description: `Bedtime, wake-up, hours and quality for the night of ${nightLabel(date)} will be removed. Everything else logged that day stays.`,
      confirmLabel: "Delete night",
    });
    if (!ok) return;
    clearSleep(date);
    onDeleted?.();
  }

  const label = variant === "gate" ? "Save and start my day" : night ? "Update" : "Save";

  return (
    <div className="space-y-4" data-testid="sleep-editor">
      <SleepTimes
        date={date}
        bedtime={form.bedtime}
        wakeTime={form.wakeTime}
        onBedtime={(bedtime) => patch({ bedtime })}
        onWakeTime={(wakeTime) => patch({ wakeTime })}
        format={format}
        bedChips={bedChips}
        wakeChips={wakeChips}
        target={profile.sleepTarget}
        morning={variant === "gate"}
        timezone={timezone}
      />
      {timezone && timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone && (
        <p className="text-xs text-paper/65">Times for this night are shown in {timezone}.</p>
      )}

      <div className="space-y-3 rounded-2xl border border-accent/25 bg-accent/[0.06] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-paper">Did you fall asleep later?</h3>
          <p className="mt-1 text-xs text-paper/65">Enter actual time asleep if you were awake for part of the night.</p>
        </div>
        <label htmlFor={asleepId} className="block text-xs font-semibold text-paper/70">Actual time asleep (hours)</label>
        <Input id={asleepId} type="number" inputMode="decimal" min={0.25} max={MAX_SLEEP_HOURS} step="any"
          value={form.asleep} onChange={(e) => patch({ asleep: e.target.value })}
          placeholder={check.ok ? "Optional correction" : "e.g. 6.5"} />
        {check.ok && (
          <div className="flex flex-wrap gap-2">
            {[15, 30, 60].filter((minutes) => check.minutes - minutes >= 15).map((minutes) => (
              <Button key={minutes} variant="outline" size="sm"
                onClick={() => patch({ asleep: String(Math.round((check.minutes - minutes) * 100 / 60) / 100) })}>
                {minutes} min awake
              </Button>
            ))}
          </div>
        )}
        <p className="text-xs text-paper/65">
          {check.ok && form.asleep && Number(form.asleep) >= 0.25 && Math.round(Number(form.asleep) * 60) <= check.minutes
            ? `${formatDuration(check.minutes - Math.round(Number(form.asleep) * 60))} awake · ${formatDuration(Math.round(Number(form.asleep) * 60))} asleep`
            : "Leave blank to use time in bed as an estimate when both times are recorded."}
        </p>
      </div>

      <div className="rounded-2xl border border-line">
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left text-xs font-semibold text-paper/70">
          Sleep quality <span className="font-normal text-paper/55">Optional</span>
          <ChevronDown className={cn("ml-auto h-4 w-4 text-paper/45", more && "rotate-180")} />
        </button>
        {more && <div className="border-t border-line p-4"><QualityPicker value={form.quality} onChange={(quality) => patch({ quality })} /></div>}
      </div>

      {error && (
        <p className="text-[0.75rem] font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {night && variant !== "gate" && (
          <Button variant="subtle" size="sm" onClick={() => void remove()} aria-label={`Delete the night of ${nightLabel(date)}`}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        )}
        {dirty && variant !== "gate" && (
          <Button variant="subtle" size="sm" onClick={() => setForm(initial)}>
            Undo changes
          </Button>
        )}
        <span className="flex-1" />
        {saved && !dirty && (
          <span className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-positive" role="status">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        <Button
          onClick={save}
          disabled={variant !== "gate" && !dirty}
          size={variant === "gate" ? "lg" : "md"}
          className={cn(variant === "gate" && "w-full")}
          data-testid="sleep-save"
        >
          {variant === "gate" ? <BedDouble className="h-4 w-4" /> : <Check className="h-4 w-4" />} {label}
        </Button>
      </div>
    </div>
  );
}

/**
 * One tap at the moment it happens: "going to bed now" in the evening, and
 * "woke up now" in the morning once a bedtime is waiting. Saved straight
 * away, because tapping it is the answer.
 */
export function useSleepQuickActions() {
  const lifeLog = useChronicle((s) => s.lifeLog);
  const recordSleep = useChronicle((s) => s.recordSleep);
  const now = useNow();
  const today = toISODate(now);
  const nowClock = clockNow(now);

  const tonightDate = bedtimeNowNight(now);
  const tonight = tonightDate ? lifeLog.find((l) => l.date === tonightDate) : undefined;
  const lastNight = lifeLog.find((l) => l.date === today);
  const wakeNow = zonedNow(lastNight?.sleepTimezone, now);
  const wakeClock = clockNow(wakeNow);

  return {
    nowClock,
    wakeClock,
    today,
    tonightDate,
    /** Evening, and tonight's bedtime isn't recorded yet. */
    canBedNow: Boolean(tonightDate && !tonight?.bedtime && !tonight?.wakeTime),
    /**
     * A bedtime is waiting for the night ending today, and it's a time people
     * wake up (3 AM to 3 PM, which covers a night shift's sleep). At 8 PM
     * "woke up now" would be wrong, so the times are picked instead.
     */
    canWakeNow: Boolean(lastNight?.bedtime && !lastNight.wakeTime && now.getHours() >= 3 && now.getHours() < 15 &&
      toISODate(wakeNow) === today && checkSleep(today, lastNight.bedtime, wakeClock, lastNight.sleepTimezone).ok),
    morning: now.getHours() >= 3 && now.getHours() < 12,
    bedNow: () => tonightDate && recordSleep({ date: tonightDate, bedtime: nowClock }),
    wakeNow: (promptKey?: string) => recordSleep({ date: today, wakeTime: wakeClock, promptKey }),
  };
}
