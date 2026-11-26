import { useLocalSearchParams, usePreventRemove, useRouter, useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { Gate } from "../src/gate";
import { useAccount, useChronicle } from "../src/session";
import { Action, Card, Copy, Field, Page, Row } from "../src/ui";
import { isISODate, planName, weeklyTargets, type WeeklyTargetIntent } from "../../../src/lib/roadmap";
import { toISODate, uid } from "../../../src/lib/utils";
import { completedTopicsOf } from "../../../src/lib/topics";
import { bucketRevisions } from "../../../src/lib/revision";
import { mergeStudyEntry } from "../src/journal";
import { OpenModule } from "../src/navigation";
import { Goals, Habits } from "../src/study";
import { LifeEditor } from "../src/life";
import { JournalFiles } from "../src/attachments";
import type { JournalEntry, Subject } from "../../../src/lib/types";

const sections = ["Study", "Life", "Goals", "Habits"] as const;
const referenceKinds = ["books", "mocks", "affairs"] as const;
type ReferenceKind = (typeof referenceKinds)[number];
const noReferences = { books: [], mocks: [], affairs: [] };

type StudyDraft = {
  date: string; subjectId: string; hours: Record<string, string>; notes: string;
  topics: Record<string, string[]>; revisionIds: string[]; targets: WeeklyTargetIntent[];
  baseVersion: number | null;
  highlights?: string;
  references?: Record<ReferenceKind, string[]>;
};

function retainedDraft(raw: string | null, date: string): StudyDraft | null {
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as StudyDraft;
    return draft.date === date && typeof draft.subjectId === "string" && !!draft.hours && typeof draft.hours === "object" &&
      typeof draft.notes === "string" && !!draft.topics && Array.isArray(draft.revisionIds) && Array.isArray(draft.targets)
      ? draft : null;
  } catch { return null; }
}

function StudyCapture({ date, today, onClose }: { date: string; today: string; onClose: () => void }) {
  const account = useAccount();
  const { store } = account;
  const navigation = useNavigation();
  const subjects = useChronicle((state) => state.subjects);
  const journal = useChronicle((state) => state.journal);
  const plans = useChronicle((state) => state.plans);
  const revisions = useChronicle((state) => state.revisions);
  const books = useChronicle((state) => state.books);
  const mocks = useChronicle((state) => state.mocks);
  const affairs = useChronicle((state) => state.currentAffairs);
  const previous = journal.find((day) => day.date === date);
  const [opened] = useState(previous);
  const [stored] = useState(() => retainedDraft(account.readDraft(date), date));
  const [baseVersion] = useState(() => stored ? stored.baseVersion : store.getState()._sync?.version ?? null);
  const [subjectId, setSubjectId] = useState(stored?.subjectId ?? subjects[0]?.id ?? "");
  const [hours, setHours] = useState<Record<string, string>>(stored?.hours ?? {});
  const [notes, setNotes] = useState(stored?.notes ?? previous?.reflection ?? "");
  const [highlights, setHighlights] = useState(stored?.highlights ?? previous?.highlights ?? "");
  const [references, setReferences] = useState<Record<ReferenceKind, string[]>>(stored?.references ?? noReferences);
  const [search, setSearch] = useState("");
  const [topics, setTopics] = useState<Record<string, string[]>>(stored?.topics ?? {});
  const [revisionIds, setRevisionIds] = useState<string[]>(stored?.revisionIds ?? []);
  const [targets, setTargets] = useState<WeeklyTargetIntent[]>(stored?.targets ?? []);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [reviewedDraft, setReviewedDraft] = useState(false);
  const subject = subjects.find((item) => item.id === subjectId);
  const queue = bucketRevisions(revisions, date);
  const existingTopics = new Set(previous ? completedTopicsOf(previous).map((item) => item.topicId) : []);
  const existingRevisions = new Set(previous?.revisionSessions?.map((item) => item.revisionItemId) ?? []);
  const pickedTopics = Object.values(topics).some((items) => items.length > 0);
  const hasReferences = referenceKinds.some((kind) => references[kind].length > 0);
  const touched = highlights !== (opened?.highlights ?? "") || hasReferences || Object.values(hours).some((value) => value.trim() !== "") || notes !== (opened?.reflection ?? "") || pickedTopics || revisionIds.length > 0 || targets.length > 0;
  const discard = () => account.writeDraft(date, null);
  function stash() {
    account.writeDraft(date, JSON.stringify({ date, subjectId, hours, notes, topics, revisionIds, targets, baseVersion, references, highlights }));
  }
  useEffect(() => {
    if (leaving || !account.isActive()) return;
    try {
      account.writeDraft(date, touched ? JSON.stringify({ date, subjectId, hours, notes, topics, revisionIds, targets, baseVersion, references, highlights }) : null);
    } catch { setError("The draft could not be saved on this device."); }
  }, [account, baseVersion, date, highlights, hours, leaving, notes, references, revisionIds, subjectId, targets, topics, touched]);
  usePreventRemove(touched && !leaving, ({ data }) => {
    Alert.alert("Close Daily Capture?", "You can keep this draft on this device and reopen it later.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Keep draft", onPress: () => {
        try { stash(); navigation.dispatch(data.action); }
        catch { setError("The draft could not be saved on this device."); }
      } },
      { text: "Discard draft", style: "destructive", onPress: () => {
        try { discard(); navigation.dispatch(data.action); }
        catch { setError("The draft could not be removed on this device."); }
      } },
    ]);
  });
  useEffect(() => { if (leaving) onClose(); }, [leaving, onClose]);

  function save() {
    try {
      const latest = store.getState();
      const last = latest.journal.find((day) => day.date === date);
      if (last !== opened) throw new Error("This journal day changed while you were editing. Reopen it to recheck the latest records.");
      if (stored && baseVersion !== (latest._sync?.version ?? null) && !reviewedDraft) {
        setError("The account synchronized since this draft was saved. Check the draft against the current day before applying it.");
        return;
      }
      let entry: JournalEntry | undefined = last;
      const keys = new Set([...Object.keys(hours), ...Object.keys(topics)]);
      const picks = [...keys].map((key) => [key, topics[key] ?? []] as const);
      if (!picks.length) picks.push(["", []]);
      const id = uid("day");
      const passes = latest.revisions.filter((item) => revisionIds.includes(item.id)).map((item) =>
        ({ subjectId: item.subjectId, topic: item.topic, revisionItemId: item.id, recalled: true })
      );
      for (const [key, topicIds] of picks) {
        entry = mergeStudyEntry({
          today, date, previous: entry, id, subject: latest.subjects.find((item) => item.id === key), topicIds,
          hours: hours[key] ?? "", reflection: notes, revisions: passes,
        });
      }
      if (!entry) return;
      if (highlights !== (opened?.highlights ?? "")) entry.highlights = highlights.trim() || undefined;
      if (hasReferences) {
        const existing = {
          books: new Set(entry.booksStudied?.map((item) => item.bookId)),
          mocks: new Set(entry.mocksAttempted?.map((item) => item.mockId)),
          affairs: new Set(entry.currentAffairs?.map((item) => item.caId)),
        };
        const newBooks = latest.books.filter((item) => references.books.includes(item.id) && !existing.books.has(item.id));
        const newMocks = latest.mocks.filter((item) => references.mocks.includes(item.id) && !existing.mocks.has(item.id));
        const newAffairs = latest.currentAffairs.filter((item) => references.affairs.includes(item.id) && !existing.affairs.has(item.id));
        if (newBooks.length) entry.booksStudied = [...entry.booksStudied ?? [], ...newBooks.map((item) => ({ bookId: item.id, title: item.title }))];
        if (newMocks.length) entry.mocksAttempted = [...entry.mocksAttempted ?? [], ...newMocks.map((item) => ({ mockId: item.id, name: item.name, score: item.score, max: item.max }))];
        if (newAffairs.length) entry.currentAffairs = [...entry.currentAffairs ?? [], ...newAffairs.map((item) => ({ caId: item.id, title: item.title, source: item.source }))];
      }
      if (!previous && !entry.totalHours && !entry.reflection && !entry.highlights && !entry.booksStudied?.length &&
          !entry.mocksAttempted?.length && !entry.currentAffairs?.length && !pickedTopics && !revisionIds.length) {
        latest.completeWeeklyTargets(date, targets);
      } else {
        latest.saveJournalEntry({ entry, previousDate: date, scheduleRevision: true, weeklyTargets: targets });
      }
      discard();
      setLeaving(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The entry could not be saved.");
    }
  }

  function pickTarget(planId: string, item: ReturnType<typeof weeklyTargets>[number]["items"][number]) {
    setTargets((before) => {
      const current = before.find((intent) => intent.planId === planId && intent.itemId === item.id);
      const rest = before.filter((intent) => intent !== current);
      return current ? rest : [...rest, {
        planId, itemId: item.id, expectedStatus: item.status, expectedTitle: item.title,
        expectedTargetDate: item.targetDate, expectedCompletedAt: item.completedAt, complete: item.status !== "completed",
      }];
    });
  }

  function chooseReference(kind: ReferenceKind, id: string) {
    setReferences((before) => ({ ...before, [kind]: before[kind].includes(id) ? before[kind].filter((item) => item !== id) : [...before[kind], id] }));
  }

  return <>
    {stored && !reviewedDraft && <Card title="Restored draft">
      <Copy muted>Review this draft before adding it to your journal.</Copy>
      <Action label="I’ve reviewed this draft" onPress={() => { setReviewedDraft(true); setError(""); }} />
    </Card>}
    <Card title="Study time">
      {subject ? <>
        <Field label="Find a subject" value={search} onChangeText={setSearch} />
        <Row>{subjects.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8).map((item) =>
          <Action key={item.id} label={item.name} selected={item.id === subjectId} primary={item.id === subjectId}
            onPress={() => { setSubjectId(item.id); setSearch(""); }} />
        )}</Row>
        <Field label={`${subject.name} hours for this day`} placeholder={String(previous?.blocks.find((block) => block.subjectId === subjectId)?.hours ?? "")}
          keyboardType="decimal-pad" value={hours[subjectId] ?? ""} onChangeText={(text) => setHours({ ...hours, [subjectId]: text })} />
      </> : <Copy>Set up a subject in Subject Progress first.</Copy>}
    </Card>
    {subject && <Card title="Completed topics">
      <TopicChoices key={subject.id} subject={subject} selected={topics[subjectId] ?? []} existing={existingTopics}
        onChange={(list) => setTopics((before) => ({ ...before, [subjectId]: list }))} />
    </Card>}
    {queue.overdue.concat(queue.dueToday).some((item) => !existingRevisions.has(item.id)) && <Card title="Revision passes">
      {queue.overdue.concat(queue.dueToday).filter((item) => !existingRevisions.has(item.id)).slice(0, 12).map((item) =>
        <Action key={item.id} label={item.topic} selected={revisionIds.includes(item.id)} primary={revisionIds.includes(item.id)}
          onPress={() => setRevisionIds((before) => before.includes(item.id) ? before.filter((id) => id !== item.id) : [...before, item.id])} />
      )}
      <OpenModule name="revision" />
    </Card>}
    {weeklyTargets(plans, date).map(({ plan, items }) => <Card key={plan.id} title={planName(plan)}>
      {items.map((item) => {
        const checked = targets.find((intent) => intent.planId === plan.id && intent.itemId === item.id)?.complete ?? item.status === "completed";
        return <Action key={item.id} label={item.title} primary={checked} selected={checked} onPress={() => pickTarget(plan.id, item)} />;
      })}
    </Card>)}
    <ReferenceChoices title="Books studied" records={books.map((item) => ({ id: item.id, title: item.title }))} selected={references.books}
      existing={previous?.booksStudied?.map((item) => item.bookId)} onSelect={(id) => chooseReference("books", id)} />
    <ReferenceChoices title="Mocks attempted" records={mocks.map((item) => ({ id: item.id, title: item.name }))} selected={references.mocks}
      existing={previous?.mocksAttempted?.map((item) => item.mockId)} onSelect={(id) => chooseReference("mocks", id)} />
    <ReferenceChoices title="Current affairs covered" records={affairs.map((item) => ({ id: item.id, title: item.title }))} selected={references.affairs}
      existing={previous?.currentAffairs?.map((item) => item.caId)} onSelect={(id) => chooseReference("affairs", id)} />
    <Field label="Highlights" multiline maxLength={4000} value={highlights} onChangeText={setHighlights} />
    <Field label="Reflection" multiline value={notes} onChangeText={setNotes} />
    {error && <Copy live>{error}</Copy>}
    <Action label="Save to this device" primary disabled={!touched} onPress={save} />
  </>;
}

function ReferenceChoices({ title, records, selected, existing, onSelect }: {
  title: string; records: { id: string; title: string }[]; selected: string[];
  existing?: (string | undefined)[]; onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  if (!records.length) return null;
  const matches = records.filter((item) => item.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);
  return <Card title={title}>
    <Field label={`Search ${title.toLowerCase()}`} value={query} onChangeText={setQuery} />
    <Row>{matches.map((item) => <Action key={item.id} label={item.title}
      selected={selected.includes(item.id) || existing?.includes(item.id)} primary={selected.includes(item.id)}
      disabled={existing?.includes(item.id)} onPress={() => onSelect(item.id)} />)}</Row>
  </Card>;
}

function TopicChoices({ subject, selected, existing, onChange }: {
  subject: Subject;
  selected: string[]; existing: Set<string | undefined>; onChange: (next: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  return <>
    <Field label="Find a topic" value={search} onChangeText={setSearch} />
    <Row>{subject.topics.filter((topic) => topic.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8).map((topic) =>
      <Action key={topic.id} label={topic.name} disabled={existing.has(topic.id)}
        selected={selected.includes(topic.id) || existing.has(topic.id)} primary={selected.includes(topic.id)}
        onPress={() => onChange(selected.includes(topic.id) ? selected.filter((id) => id !== topic.id) : [...selected, topic.id])} />
    )}</Row>
  </>;
}

function Capture() {
  const router = useRouter();
  const args = useLocalSearchParams<{ date?: string; section?: string }>();
  const today = toISODate(new Date());
  const date = isISODate(args.date) && args.date <= today ? args.date : today;
  const [section, setSection] = useState<(typeof sections)[number]>(sections.find((item) => item.toLowerCase() === args.section) ?? "Study");
  const close = () => router.canGoBack() ? router.back() : router.replace("/");
  return <Page title="Daily Capture" intro={date}>
    <Row>{sections.map((item) => <Action key={item} label={item} selected={item === section} primary={item === section} onPress={() => setSection(item)} />)}</Row>
    {section === "Study" && <StudyCapture key={date} date={date} today={today} onClose={close} />}
    {section === "Study" && <JournalFiles key={`files-${date}`} date={date} />}
    {section === "Life" && <LifeEditor date={date} today={today} />}
    {section === "Goals" && <Goals embedded />}
    {section === "Habits" && <Habits embedded />}
  </Page>;
}

export default function Screen() {
  return <Gate><Capture /></Gate>;
}
