import { useState } from "react";
import { bedtimeNowNight, checkSleep, clockNow, isClock, promptStartMinutes, sleepPromptKey, usualClock } from "../../../src/lib/sleep";
import { toISODate } from "../../../src/lib/utils";
import { useAccount, useChronicle } from "./session";
import { Action, Card, Copy, Field, Row } from "./ui";

export function MorningCheckIn() {
  const life = useChronicle((s) => s.lifeLog);
  const journal = useChronicle((s) => s.journal);
  const dismissed = useChronicle((s) => s.lastSleepPrompt);
  const fields = useChronicle((s) => s.profile.lifeFields);
  const now = new Date();
  const today = toISODate(now);
  const key = sleepPromptKey(now, promptStartMinutes(life));
  const night = life.find((item) => item.date === today);
  const day = journal.find((item) => item.date === today);
  if (fields && !fields.includes("sleep")) return null;
  if (key !== today || dismissed === key || bedtimeNowNight(now) ||
      (night?.bedtime && night.wakeTime) || (day?.sleepTime && day.wakeTime)) return null;
  return <CheckIn key={key} date={today} existingBed={night?.bedtime ?? day?.sleepTime}
    timezone={night?.sleepTimezone} usualBed={usualClock(life, "bedtime", today)} />;
}

function CheckIn({ date, existingBed, timezone, usualBed }: {
  date: string; existingBed?: string; timezone?: string; usualBed: string | null;
}) {
  const { store } = useAccount();
  const [bedtime, setBedtime] = useState(existingBed ?? "");
  const [wakeTime, setWake] = useState("");
  const [awake, setAwake] = useState("");
  const [error, setError] = useState("");
  function save() {
    if (!isClock(bedtime) || !isClock(wakeTime)) { setError("Enter bedtime and wake-up as HH:MM."); return; }
    const result = checkSleep(date, bedtime, wakeTime, timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    if (!result.ok) { setError(result.message); return; }
    const awakeMinutes = awake.trim() === "" ? null : Number(awake);
    if (awakeMinutes != null && (!Number.isInteger(awakeMinutes) || awakeMinutes < 0 || awakeMinutes >= result.minutes)) {
      setError("Enter waking minutes shorter than your time in bed.");
      return;
    }
    try {
      const latest = store.getState();
      const recorded = latest.lifeLog.find((row) => row.date === date);
      const journalRecorded = latest.journal.find((row) => row.date === date);
      if ((recorded?.bedtime ?? journalRecorded?.sleepTime) !== existingBed || recorded?.wakeTime || journalRecorded?.wakeTime) {
        setError("This night already changed. Review it in Life before editing.");
        return;
      }
      latest.recordSleep({
        date, bedtime, wakeTime, deriveHours: true,
        hours: awakeMinutes == null ? undefined : (result.minutes - awakeMinutes) / 60, promptKey: date,
      });
    } catch { setError("This check-in could not be saved."); }
  }
  return <Card title="Morning check-in">
    <Copy muted>Review last night before saving. Blank waking minutes leaves the duration estimated.</Copy>
    <Field label="Bedtime (HH:MM)" value={bedtime} onChangeText={setBedtime} />
    {usualBed && !bedtime && <Action label={`Use usual bedtime · ${usualBed}`} onPress={() => setBedtime(usualBed)} />}
    <Field label="Wake-up (HH:MM)" value={wakeTime} onChangeText={setWake} />
    {!wakeTime && <Action label="Woke up now" onPress={() => setWake(clockNow())} />}
    <Field label="Minutes awake overnight (optional)" value={awake} onChangeText={setAwake} keyboardType="number-pad" />
    {error && <Copy live>{error}</Copy>}
    <Row><Action label="Save sleep" primary onPress={save} />
      <Action label="Skip today" onPress={() => store.getState().dismissSleepPrompt(date)} /></Row>
  </Card>;
}
