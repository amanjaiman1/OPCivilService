import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { takeBedtimeConfirmation } from "./push";
import { buildLifeReport, presetSpan, trackedFields, type SpanPreset } from "../../../src/lib/life";
import { LIFE_INPUTS, draftFromEntry, entryFromDraft, EXERCISE_TYPES } from "../../../src/lib/life-entry";
import { isISODate } from "../../../src/lib/roadmap";
import { isClock, bedtimeNowNight } from "../../../src/lib/sleep";
import { toISODate } from "../../../src/lib/utils";
import { useAccount, useChronicle } from "./session";
import { Action, Card, Copy, Field, Page, Row } from "./ui";

export function LifeEditor({ date, today }: { date: string; today: string }) {
  const { store } = useAccount();
  const [existing, setExisting] = useState(() => store.getState().lifeLog.find((row) => row.date === date));
  const [draft, setDraft] = useState(() => draftFromEntry(date, existing));
  const [message, setMessage] = useState("");
  const selected = useChronicle((s) => s.profile.lifeFields);
  const tracked = trackedFields(selected);
  function save() {
    const active = store.getState();
    if (active.lifeLog.find((row) => row.date === date) !== existing) {
      setMessage("The day changed while you were editing. Reopen this day to see its latest readings.");
      return;
    }
    if ((draft.bedtime && !isClock(draft.bedtime)) || (draft.wakeTime && !isClock(draft.wakeTime))) {
      setMessage("Enter times as HH:MM, or leave them blank.");
      return;
    }
    const result = entryFromDraft(draft, today, existing);
    if (Object.keys(result.errors).length) {
      setMessage(Object.values(result.errors).join(" "));
      return;
    }
    try {
      if (result.entry) active.upsertLifeEntry(result.entry);
      else if (existing) active.deleteLifeEntry(date);
      const saved = store.getState().lifeLog.find((row) => row.date === date);
      setExisting(saved);
      setDraft(draftFromEntry(date, saved));
      setMessage("Saved on this device.");
    } catch {
      setMessage("Could not save to this device.");
    }
  }
  return <Card title={`Life record · ${date}`}>
    {tracked.includes("sleep") && <Row>
      <Field label="Bedtime (HH:MM)" placeholder="23:00" keyboardType="numbers-and-punctuation" value={draft.bedtime} onChangeText={(bedtime) => setDraft({ ...draft, bedtime })} />
      <Field label="Wake-up (HH:MM)" placeholder="07:00" keyboardType="numbers-and-punctuation" value={draft.wakeTime} onChangeText={(wakeTime) => setDraft({ ...draft, wakeTime })} />
    </Row>}
    {LIFE_INPUTS.filter((field) => tracked.includes(field.field)).map(({ key, label, unit }) => <Field key={key} label={`${label} (${unit})`}
      keyboardType="decimal-pad" value={draft.numbers[key]} onChangeText={(value) => setDraft({ ...draft, numbers: { ...draft.numbers, [key]: value } })} />)}
    {tracked.includes("exercise") && <Row>{EXERCISE_TYPES.map((exerciseType) => <Action key={exerciseType} label={exerciseType} selected={draft.exerciseType === exerciseType}
      onPress={() => setDraft({ ...draft, exerciseType: draft.exerciseType === exerciseType ? "" : exerciseType })} />)}</Row>}
    <Field label="Note" maxLength={280} multiline value={draft.note} onChangeText={(note) => setDraft({ ...draft, note })} />
    {message && <Copy live>{message}</Copy>}
    <Action label="Save Life record" primary onPress={save} />
    {existing?.sleepHours != null && <Copy muted>{existing.sleepHours} h · {existing.sleepHoursSource === "reported" ? "reported asleep" : "estimated"}</Copy>}
  </Card>;
}

export function LifeDashboard() {
  const { store, id } = useAccount();
  const { bedtime: confirmation } = useLocalSearchParams<{ bedtime?: string }>();
  const lifeLog = useChronicle((s) => s.lifeLog);
  const journal = useChronicle((s) => s.journal);
  const fields = useChronicle((s) => s.profile.lifeFields);
  const [preset, setPreset] = useState<SpanPreset>("7d");
  const today = toISODate(new Date());
  const [dateInput, setDateInput] = useState(today);
  const [opened, setOpened] = useState(today);
  const [message, setMessage] = useState("");
  const report = useMemo(() => buildLifeReport({
    journal, lifeLog, span: presetSpan(preset, today), tracked: trackedFields(fields, lifeLog),
  }), [journal, lifeLog, preset, today, fields]);
  const bedtime = useCallback(() => {
    Alert.alert("Record bedtime?", "This saves your current local time to tonight’s sleep record.", [
      { text: "Cancel", style: "cancel" },
      { text: "Record bedtime", onPress: () => {
        const now = new Date();
        const hhmm = [now.getHours(), now.getMinutes()].map((n) => String(n).padStart(2, "0")).join(":");
        const date = bedtimeNowNight(now);
        if (!date) { setMessage("Open a day below to enter bedtime manually."); return; }
        const state = store.getState();
        const previous = state.lifeLog.find((entry) => entry.date === date);
        if (previous?.bedtime) {
          setMessage("This night already has a bedtime. Open the recorded day to correct it.");
          return;
        }
        try {
          state.recordSleep({ date, bedtime: hhmm });
          setMessage("Bedtime saved on this device.");
        } catch { setMessage("Bedtime could not be saved."); }
      } },
    ]);
  }, [store]);
  useEffect(() => {
    if (takeBedtimeConfirmation(id, confirmation)) bedtime();
  }, [id, confirmation, bedtime]);
  return <Page title="Life" intro="Sleep, movement and the routines behind your study.">
    <Action label="Going to bed now" primary onPress={bedtime} />
    {message && <Copy live>{message}</Copy>}
    <Card title="Your measurements">
      <Row>{(["7d", "30d", "90d"] as const).map((span) => <Action key={span} label={span.replace("d", " days")} primary={span === preset} selected={span === preset} onPress={() => setPreset(span)} />)}</Row>
      {report.metrics.map((metric) => <Copy key={metric.id}>
        {metric.label} · {metric.value == null ? "No readings" : `${metric.value} ${metric.unit} · ${metric.recorded} recorded days`}
      </Copy>)}
    </Card>
    <Card title="Open a day">
      <Field label="Date (YYYY-MM-DD)" maxLength={10} value={dateInput} onChangeText={setDateInput} />
      <Action label="Open Life record" disabled={!isISODate(dateInput) || dateInput > today} onPress={() => setOpened(dateInput)} />
    </Card>
    <LifeEditor key={opened} date={opened} today={today} />
  </Page>;
}
