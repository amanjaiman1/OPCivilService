import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { buildGoalLabel, bounded } from "./study-labels";
import { useAccount, useChronicle } from "./session";
import { Action, Card, Copy, Field, Page, Row } from "./ui";
import { toISODate, formatHours, uid } from "../../../src/lib/utils";
import { isISODate } from "../../../src/lib/roadmap";
import { bucketRevisions, newRevisionItem } from "../../../src/lib/revision";
import { habitContext, habitSchedule, habitSource, isPausedNow, recentDays, todayHabits } from "../../../src/lib/habit-engine";
import { computeGoalProgress, goalCategory, validateGoal } from "../../../src/lib/goals";
import { weeklyGoalInView, weeklyGoalItems } from "../../../src/lib/weekly-goal-items";
import { completedTopicsOf } from "../../../src/lib/topics";
import type { Goal, GoalCategory, Habit, TopicStatus } from "../../../src/lib/types";

const todayDate = () => toISODate(new Date());
const completion = (name: string, value: number) => `${name} · ${value}%`;

export function Journal() {
  const router = useRouter();
  const journal = useChronicle((s) => s.journal);
  const [day, setDay] = useState(todayDate);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(15);
  const history = useMemo(() => [...journal].filter((entry) => [entry.date, entry.reflection, entry.highlights, ...completedTopicsOf(entry).map((topic) => topic.name)]
    .some((part) => part?.toLowerCase().includes(search.trim().toLowerCase()))).sort((a, b) => b.date.localeCompare(a.date)), [journal, search]);
  return <Page title="Daily Journal">
    <Card title="Open a day"><Field label="Date (YYYY-MM-DD)" maxLength={10} value={day} onChangeText={setDay} />
      <Action label="Edit day in Daily Capture" primary disabled={!isISODate(day) || day > todayDate()} onPress={() => router.push({ pathname: "/capture", params: { date: day } })} />
    </Card>
    <Field label="Search journal history" value={search} onChangeText={setSearch} />
    {history.slice(0, limit).map((entry) => <Card key={entry.id} title={entry.date}>
      <Copy>{formatHours(entry.totalHours)} · {completedTopicsOf(entry).length} completed topics</Copy>
      {entry.reflection && <Copy muted>{entry.reflection.length > 300 ? `${entry.reflection.slice(0, 300)}…` : entry.reflection}</Copy>}
      {entry.fileIds?.length ? <Copy muted>{entry.fileIds.length} attached files</Copy> : null}
      <Action label={`Edit ${entry.date}`} onPress={() => router.push({ pathname: "/capture", params: { date: entry.date } })} />
    </Card>)}
    {!history.length && <Copy muted>No journal days match this view.</Copy>}
    {history.length > limit && <Action label="Show more days" onPress={() => setLimit(limit + 15)} />}
  </Page>;
}

const statuses: { id: TopicStatus; label: string }[] = [
  { id: "untouched", label: "Untouched" }, { id: "learning", label: "Learning" },
  { id: "revised", label: "Revised" }, { id: "mastered", label: "Mastered" },
];

export function Subjects() {
  const { store } = useAccount();
  const subjects = useChronicle((s) => s.subjects);
  const [id, setId] = useState(subjects[0]?.id);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [limit, setLimit] = useState(16);
  const subject = subjects.find((item) => item.id === id);
  const topics = subject?.topics.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  return <Page title="Subject Progress">
    <Row>{subjects.map((item) => <Action key={item.id} label={item.name} selected={id === item.id} primary={id === item.id}
      onPress={() => { setId(item.id); setQuery(""); setName(""); setLimit(16); }} />)}</Row>
    {subject && <Card title={subject.name}>
      <Field label="Search topics" value={query} onChangeText={setQuery} />
      {topics.slice(0, limit).map((topic) => <Card key={topic.id} title={completion(topic.name, topic.confidence)}>
        <Copy muted>{topic.revisionCount} revisions{topic.lastTouched ? ` · last touched ${topic.lastTouched}` : ""}</Copy>
        <Row>{statuses.map((status) => <Action key={status.id} label={status.label} selected={topic.status === status.id}
          primary={topic.status === status.id} onPress={() => store.getState().setTopicStatusById(topic.id, status.id)} />)}</Row>
      </Card>)}
      {topics.length > limit && <Action label="Show more topics" onPress={() => setLimit(limit + 16)} />}
      <Field label="New custom topic" value={name} onChangeText={setName} maxLength={160} />
      <Action label="Add topic" disabled={!name.trim()} onPress={() => {
        const result = store.getState().addTopic(subject.id, name.trim());
        if (result) { setName(""); setMessage("Topic saved on this device."); }
        else setMessage("A matching topic already exists, or this topic could not be added.");
      }} />
      {message && <Copy live>{message}</Copy>}
    </Card>}
  </Page>;
}

export function Revision() {
  const { store } = useAccount();
  const revisions = useChronicle((s) => s.revisions);
  const subjects = useChronicle((s) => s.subjects);
  const [subjectId, setSubject] = useState(subjects[0]?.id ?? "");
  const [item, setItem] = useState("");
  const [view, setView] = useState<"due" | "upcoming">("due");
  const [limit, setLimit] = useState(14);
  const queue = bucketRevisions(revisions, todayDate());
  const rows = view === "due" ? [...queue.overdue, ...queue.dueToday] : queue.upcoming;
  return <Page title="Revision" intro="Your existing spaced-repetition schedule follows you across devices.">
    <Row>{(["due", "upcoming"] as const).map((key) => <Action key={key} label={key === "due" ? "Due" : "Upcoming"}
      primary={view === key} selected={view === key} onPress={() => { setView(key); setLimit(14); }} />)}</Row>
    {rows.slice(0, limit).map((record) => <Card key={record.id} title={record.topic}>
      <Copy muted>Due {record.nextDue} · {record.repetitions} passes</Copy>
      {view === "due" && <Row>
        <Action label="Remembered" primary onPress={() => store.getState().reviseItem(record.id, true)} />
        <Action label="Needs practice" onPress={() => store.getState().reviseItem(record.id, false)} />
      </Row>}
    </Card>)}
    {!rows.length && <Copy muted>No revisions in this view.</Copy>}
    {rows.length > limit && <Action label="Show more revisions" onPress={() => setLimit(limit + 14)} />}
    <Card title="Queue a custom revision">
      <Field label="Topic" value={item} onChangeText={setItem} maxLength={160} />
      <Row>{subjects.map((subject) => <Action key={subject.id} label={subject.name} selected={subjectId === subject.id}
        primary={subjectId === subject.id} onPress={() => setSubject(subject.id)} />)}</Row>
      <Action label="Add revision" disabled={!item.trim() || !subjectId} onPress={() => {
        const latest = store.getState();
        if (!latest.revisions.some((record) => record.subjectId === subjectId && record.topic.toLowerCase() === item.trim().toLowerCase())) {
          latest.upsertRevision(newRevisionItem(subjectId, item.trim()));
        }
        setItem("");
      }} />
    </Card>
  </Page>;
}

function HabitDetails({ habit }: { habit: Habit }) {
  const { store } = useAccount();
  const data = useChronicle((state) => state);
  const [name, setName] = useState(habit.name);
  const [days, setDays] = useState("");
  const today = todayDate();
  const context = habitContext(data, today);
  const paused = isPausedNow(habit, today);
  const schedule = habitSchedule(habit);
  return <Card title="Edit habit">
    <Field label="Habit name" maxLength={100} value={name} onChangeText={setName} />
    <Action label="Save name" disabled={!name.trim() || name.trim() === habit.name} onPress={() => store.getState().updateHabit(habit.id, { name })} />
    <Copy>Schedule · {schedule.kind === "weekly" ? `${schedule.timesPerWeek} days per week` : schedule.kind === "weekdays" ? "Selected weekdays" : schedule.kind === "weeklyTotal" ? "Weekly total" : "Daily"}</Copy>
    {habitSource(habit) === "manual" && <Row>
      <Action label="Every day" selected={schedule.kind === "daily"} onPress={() => store.getState().updateHabit(habit.id, { schedule: { kind: "daily" } })} />
      <Field label="Days per week (1–7)" maxLength={1} keyboardType="number-pad" value={days} onChangeText={setDays} />
      <Action label="Set weekly schedule" disabled={!/^[1-7]$/.test(days)} onPress={() => store.getState().updateHabit(habit.id, { schedule: { kind: "weekly", timesPerWeek: Number(days) } })} />
    </Row>}
    <Row>
      <Action label={paused ? "Resume" : "Pause"} onPress={() => store.getState().setHabitPaused(habit.id, !paused)} />
      <Action label="Archive habit" onPress={() => store.getState().setHabitArchived(habit.id, true)} />
    </Row>
    <Copy muted>Recent check-ins</Copy>
    {recentDays(habit, context, 7).map((day) => <Row key={day.date}>
      <Copy>{day.date} · {day.done ? "Complete" : day.status}</Copy>
      {day.scheduled && <Action label={day.done ? "Correct to missed" : "Correct to complete"} onPress={() => store.getState().setHabitOverride(habit.id, day.date, { kind: day.done ? "missed" : "done" })} />}
      {day.override && <Action label="Clear correction" onPress={() => store.getState().setHabitOverride(habit.id, day.date, null)} />}
    </Row>)}
  </Card>;
}

export function Habits({ embedded = false }: { embedded?: boolean }) {
  const { store } = useAccount();
  const state = useChronicle((s) => s);
  const [name, setName] = useState("");
  const today = todayDate();
  const rows = todayHabits(state.habits, habitContext(state, today));
  const [selectedHabit, setSelectedHabit] = useState<string>();
  const archived = state.habits.filter((habit) => habit.archived);
  const content = <>
    {rows.map(({ habit, done, streak, streakUnit }) => {
      const manual = habitSource(habit) === "manual" || habit.allowManual;
      return <Card key={habit.id} title={habit.name}>
        <Copy>{done ? "Complete" : "Open"} · {streak} {streakUnit} streak</Copy>
        {manual ? <Action label={done ? "Undo check-in" : "Check in today"} primary={!done} selected={done}
          onPress={() => store.getState().toggleHabit(habit.id, today)} /> : <Copy muted>Fills from linked records</Copy>}
        {!embedded && <Action label={selectedHabit === habit.id ? "Hide details" : "Schedule and history"} onPress={() => setSelectedHabit(selectedHabit === habit.id ? undefined : habit.id)} />}
        {!embedded && selectedHabit === habit.id && <HabitDetails key={habit.id} habit={habit} />}
      </Card>;
    })}
    {!rows.length && <Copy muted>No active habits.</Copy>}
    {!embedded && archived.length > 0 && <Card title="Archived habits">
      {archived.map((habit) => <Action key={habit.id} label={`Restore ${habit.name}`} onPress={() => store.getState().setHabitArchived(habit.id, false)} />)}
    </Card>}
    {!embedded && <Card title="New manual habit">
      <Field label="Habit name" value={name} onChangeText={setName} maxLength={100} />
      <Action label="Add habit" disabled={!name.trim()} onPress={() => { store.getState().addHabit(name.trim()); setName(""); }} />
    </Card>}
  </>;
  return embedded ? content : <Page title="Habits">{content}</Page>;
}

const categories: GoalCategory[] = ["Study", "Syllabus", "Revision", "Mock tests", "Current affairs", "Health", "Personal"];

export function Goals({ embedded = false }: { embedded?: boolean }) {
  const { store } = useAccount();
  const state = useChronicle((s) => s);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [category, setCategory] = useState<GoalCategory>("Study");
  const [editing, setEditing] = useState<Goal>();
  const [view, setView] = useState<"active" | "all">("active");
  const [message, setMessage] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState(12);
  const today = todayDate();
  const visible = state.goals.filter((goal) => view === "all" || goal.status === "Active");
  const weekly = weeklyGoalItems(state.plans, today).filter((row) => weeklyGoalInView(row, view));
  function save() {
    const latest = editing && store.getState().goals.find((item) => item.id === editing.id);
    if (editing && latest !== editing) { setMessage("This goal changed. Open Edit goal again to load the latest values."); return; }
    const goal: Goal = {
      ...(latest ?? { id: uid("g"), horizon: "Weekly", status: "Active", createdOn: today, metric: "manual" }),
      title: name.trim(), category, target: target.trim() ? Number(target) : undefined, deadline: deadline.trim() || undefined,
    };
    const errors = validateGoal(goal, today, !latest);
    if (Object.keys(errors).length || (goal.deadline && !isISODate(goal.deadline))) {
      setMessage(Object.values(errors).join(" ") || "Use YYYY-MM-DD for a valid deadline.");
      return;
    }
    store.getState().upsertGoal(goal);
    setName(""); setDeadline(""); setTarget(""); setMessage(""); setEditing(undefined);
  }
  const content = <>
    <Row><Action label="Active" selected={view === "active"} primary={view === "active"} onPress={() => setView("active")} />
      <Action label="All goals" selected={view === "all"} primary={view === "all"} onPress={() => setView("all")} /></Row>
    {weekly.length > 0 && <Card title="Study · Weekly Roadmap">
      {weekly.slice(0, limit).map(({ planId, item, archived }) => <Action key={`${planId}:${item.id}`} label={item.title}
        selected={item.status === "completed"} primary={item.status === "completed"} disabled={archived}
        onPress={() => store.getState().setPlanItemStatus(planId, item.id, item.status === "completed" ? "notStarted" : "completed")} />)}
    </Card>}
    {visible.slice(0, limit).map((goal) => {
      const progress = computeGoalProgress(goal, state, today);
      return <Card key={goal.id} title={goal.title}>
        <Copy>{goalCategory(goal)} · {goal.status} · {buildGoalLabel(progress)}</Copy>
        {goal.deadline && <Copy muted>Due {goal.deadline}</Copy>}
        {(goal.milestones ?? []).map((milestone) => <Action key={milestone.id} label={milestone.title}
          selected={!!milestone.doneOn} primary={!!milestone.doneOn} onPress={() => store.getState().toggleGoalMilestone(goal.id, milestone.id, today)} />)}
        {(!goal.metric || goal.metric === "manual") && goal.status === "Active" && <>
          <Field label={`Progress for ${goal.title}`} value={values[goal.id] ?? ""} keyboardType="decimal-pad"
            onChangeText={(value) => setValues({ ...values, [goal.id]: value })} />
          <Action label="Save progress" disabled={!bounded(values[goal.id], 0, 10_000_000)}
            onPress={() => { store.getState().logGoalProgress(goal.id, Number(values[goal.id])); setValues({ ...values, [goal.id]: "" }); }} />
        </>}
        {!embedded && <Row>
          <Action label="Edit goal" onPress={() => {
            setEditing(goal); setName(goal.title); setDeadline(goal.deadline ?? ""); setTarget(goal.target == null ? "" : String(goal.target));
            setCategory(goalCategory(goal)); setMessage("");
          }} />
          <Action label={goal.status === "Completed" ? "Reopen goal" : "Mark complete"}
            onPress={() => store.getState().setGoalStatus(goal.id, goal.status === "Completed" ? "Active" : "Completed")} />
        </Row>}
      </Card>;
    })}
    {Math.max(visible.length, weekly.length) > limit && <Action label="Show more goals" onPress={() => setLimit(limit + 12)} />}
    {!embedded && <Card title={editing ? `Edit ${editing.title}` : "New manual goal"}>
      <Field label="Title" value={name} onChangeText={setName} maxLength={140} />
      <Row>{categories.map((key) => <Action key={key} label={key} selected={category === key} primary={category === key} onPress={() => setCategory(key)} />)}</Row>
      <Field label="Target (optional)" value={target} onChangeText={setTarget} keyboardType="decimal-pad" />
      <Field label="Deadline (YYYY-MM-DD, optional)" value={deadline} onChangeText={setDeadline} />
      {message && <Copy live>{message}</Copy>}
      <Action label={editing ? "Save goal" : "Create goal"} primary disabled={!name.trim()} onPress={save} />
      {editing && <Action label="Cancel editing" onPress={() => {
        setEditing(undefined); setName(""); setTarget(""); setDeadline(""); setMessage("");
      }} />}
    </Card>}
  </>;
  return embedded ? content : <Page title="Goals">{content}</Page>;
}
