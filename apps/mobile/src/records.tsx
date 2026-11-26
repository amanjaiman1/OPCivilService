import { useState } from "react";
import { useAccount, useChronicle } from "./session";
import { Action, Card, Copy, Field, Page, Row } from "./ui";
import { bounded } from "./study-labels";
import { toISODate, uid } from "../../../src/lib/utils";
import { summarize } from "../../../src/lib/mock-analytics";
import type { Book, CurrentAffair, MockType, Reflection } from "../../../src/lib/types";

const today = () => toISODate(new Date());

export function Diary() {
  const { store } = useAccount();
  const records = useChronicle((s) => s.reflections);
  const [edition, setEdition] = useState<Reflection | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);
  const visible = [...records].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.date.localeCompare(a.date))
    .filter((entry) => `${entry.title ?? ""} ${entry.content}`.toLowerCase().includes(query.trim().toLowerCase()));
  function edit(entry: Reflection | null) {
    setEdition(entry);
    setTitle(entry?.title ?? "");
    setContent(entry?.content ?? "");
    setMessage("");
  }
  function save() {
    const latest = store.getState();
    if (edition && latest.reflections.find((item) => item.id === edition.id) !== edition) {
      setMessage("This entry changed. Open the latest entry before saving.");
      return;
    }
    const entry: Reflection = {
      ...edition, title: title.trim() || undefined, content: content.trim(), id: edition?.id ?? uid("diary"), date: edition?.date ?? today(),
    };
    latest.saveDiaryEntry({ entry });
    edit(null);
    setMessage("Saved on this device.");
  }
  return <Page title="Personal Diary">
    <Card title={edition ? "Edit entry" : "Write an entry"}>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={160} />
      <Field label="Entry" value={content} onChangeText={setContent} multiline />
      {message && <Copy live>{message}</Copy>}
      <Row><Action label="Save diary entry" primary disabled={!content.trim()} onPress={save} />
        {edition && <Action label="Cancel editing" onPress={() => edit(null)} />}</Row>
    </Card>
    <Field label="Find entries" value={query} onChangeText={setQuery} />
    {visible.slice(0, limit).map((entry) => <Card key={entry.id} title={entry.title || entry.date}>
      <Copy muted>{entry.date}{entry.pinned ? " · Pinned" : ""}</Copy>
      <Copy>{entry.content.slice(0, 260)}{entry.content.length > 260 ? "…" : ""}</Copy>
      <Row><Action label="Open entry" onPress={() => edit(entry)} />
        <Action label={entry.pinned ? "Unpin" : "Pin"} onPress={() => store.getState().setDiaryFlag(entry.id, "pinned", !entry.pinned)} /></Row>
    </Card>)}
    {!visible.length && <Copy muted>No entries match.</Copy>}
    {visible.length > limit && <Action label="Show more entries" onPress={() => setLimit(limit + 12)} />}
  </Page>;
}

export function Library() {
  const { store } = useAccount();
  const books = useChronicle((s) => s.books);
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [pages, setPages] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);
  const matches = books.filter((item) => `${item.title} ${item.author}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <Page title="Library">
    <Field label="Find books" value={query} onChangeText={setQuery} />
    {matches.slice(0, limit).map((item) => <Card key={item.id} title={item.title}>
      <Copy>{item.author} · {item.currentPage} / {item.totalPages} pages</Copy>
      <Field label={`Current page for ${item.title}`} keyboardType="number-pad" value={values[item.id] ?? ""}
        onChangeText={(next) => setValues({ ...values, [item.id]: next })} />
      <Action label="Save page" disabled={!bounded(values[item.id], 0, item.totalPages) || !Number.isInteger(Number(values[item.id]))}
        onPress={() => {
          store.getState().updateBookProgress(item.id, Number(values[item.id]));
          setValues({ ...values, [item.id]: "" });
        }} />
    </Card>)}
    {matches.length > limit && <Action label="Show more books" onPress={() => setLimit(limit + 12)} />}
    <Card title="Add a book">
      <Field label="Title" value={name} onChangeText={setName} maxLength={160} />
      <Field label="Author" value={author} onChangeText={setAuthor} maxLength={120} />
      <Field label="Total pages" value={pages} onChangeText={setPages} keyboardType="number-pad" />
      <Action label="Add book" disabled={!name.trim() || !bounded(pages, 1, 50000) || !Number.isInteger(Number(pages))} onPress={() => {
        const book: Book = { id: uid("book"), title: name.trim(), author: author.trim(), totalPages: Number(pages), currentPage: 0, status: "To Read" };
        store.getState().upsertBook(book);
        setName(""); setAuthor(""); setPages("");
      }} />
    </Card>
  </Page>;
}

export function Affairs() {
  const { store } = useAccount();
  const entries = useChronicle((s) => s.currentAffairs);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [summary, setSummary] = useState("");
  const [limit, setLimit] = useState(12);
  const [bookmarks, setBookmarks] = useState(false);
  const visible = entries.filter((item) => !bookmarks || item.bookmarked);
  return <Page title="Current Affairs">
    <Card title="Record an item">
      <Field label="Headline" value={title} onChangeText={setTitle} maxLength={160} />
      <Field label="Source" value={source} onChangeText={setSource} maxLength={160} />
      <Field label="Summary" value={summary} onChangeText={setSummary} multiline />
      <Action label="Save news item" disabled={!title.trim() || !summary.trim()} onPress={() => {
        const item: CurrentAffair = { id: uid("ca"), title: title.trim(), source: source.trim(), summary: summary.trim(),
          date: today(), category: "Misc", tags: [], prelimsRelevant: false, mainsRelevant: false, bookmarked: false };
        store.getState().upsertCurrentAffair(item);
        setTitle(""); setSource(""); setSummary("");
      }} />
    </Card>
    <Action label={bookmarks ? "Show all" : "Show bookmarks"} selected={bookmarks} onPress={() => setBookmarks(!bookmarks)} />
    {visible.slice(0, limit).map((item) => <Card key={item.id} title={item.title}>
      <Copy muted>{item.date}{item.source ? ` · ${item.source}` : ""}</Copy>
      <Copy>{item.summary}</Copy>
      <Action label={item.bookmarked ? "Remove bookmark" : "Bookmark"} onPress={() => store.getState().toggleBookmark(item.id)} />
    </Card>)}
    {visible.length > limit && <Action label="Show more items" onPress={() => setLimit(limit + 12)} />}
  </Page>;
}

const mockTypes: MockType[] = ["Prelims GS", "Prelims CSAT", "Mains GS", "Mains Essay", "Mains Optional", "Sectional"];

export function Mocks() {
  const { store } = useAccount();
  const mocks = useChronicle((s) => s.mocks);
  const [name, setName] = useState("");
  const [score, setScore] = useState("");
  const [max, setMax] = useState("");
  const [type, setType] = useState<MockType>("Prelims GS");
  const [limit, setLimit] = useState(12);
  const stats = summarize(mocks.filter((item) => item.type === type));
  const visible = [...mocks].filter((item) => item.type === type).sort((a, b) => b.date.localeCompare(a.date));
  return <Page title="Mock Analytics">
    <Row>{mockTypes.map((option) => <Action key={option} label={option} primary={option === type}
      selected={option === type} onPress={() => setType(option)} />)}</Row>
    <Card title="Results">
      <Copy>{stats.count} tests{stats.count ? ` · average ${stats.average}%` : ""}</Copy>
      {visible.slice(0, limit).map((item) => <Copy key={item.id}>{item.name} · {item.score} / {item.max} · {item.date}</Copy>)}
      {visible.length > limit && <Action label="Show more tests" onPress={() => setLimit(limit + 12)} />}
    </Card>
    <Card title="Record a score">
      <Field label="Test name" value={name} onChangeText={setName} maxLength={160} />
      <Field label="Score" value={score} onChangeText={setScore} keyboardType="numbers-and-punctuation" />
      <Field label="Maximum score" value={max} onChangeText={setMax} keyboardType="decimal-pad" />
      <Action label="Save test" disabled={!name.trim() || !bounded(max, 1, 10000) || !bounded(score, -Number(max), Number(max))} onPress={() => {
        store.getState().upsertMock({ id: uid("mock"), name: name.trim(), date: today(), type, score: Number(score), max: Number(max) });
        setName(""); setScore(""); setMax("");
      }} />
    </Card>
  </Page>;
}

export function Mistakes() {
  const { store } = useAccount();
  const mistakes = useChronicle((s) => s.mistakes);
  const subjects = useChronicle((s) => s.subjects);
  const [topic, setTopic] = useState("");
  const [correction, setCorrection] = useState("");
  const [subject, setSubject] = useState(subjects[0]?.id ?? "");
  const [limit, setLimit] = useState(12);
  const date = today();
  return <Page title="Mistake Tracker">
    {mistakes.slice(0, limit).map((item) => <Card key={item.id} title={item.topic}>
      <Copy>{item.status} · {item.category} · next review {item.nextReview}</Copy>
      {item.correctAnswer && <Copy muted>{item.correctAnswer}</Copy>}
      {item.status !== "Mastered" && <Row>
        <Action label="Recalled" onPress={() => store.getState().reviewMistake(item.id, true)} />
        <Action label="Missed" onPress={() => store.getState().reviewMistake(item.id, false)} />
      </Row>}
    </Card>)}
    {mistakes.length > limit && <Action label="Show more mistakes" onPress={() => setLimit(limit + 12)} />}
    <Card title="Record a mistake">
      <Field label="Topic" value={topic} onChangeText={setTopic} maxLength={160} />
      <Row>{subjects.map((item) => <Action key={item.id} label={item.name} selected={item.id === subject} primary={item.id === subject} onPress={() => setSubject(item.id)} />)}</Row>
      <Field label="Correction" value={correction} onChangeText={setCorrection} multiline />
      <Action label="Save mistake" disabled={!topic.trim() || !subject} onPress={() => {
        store.getState().upsertMistake({ id: uid("mistake"), date, subjectId: subject, topic: topic.trim(), category: "Conceptual",
          correctAnswer: correction.trim() || undefined, status: "Open", reviewCount: 0, nextReview: date, intervalDays: 0 });
        setTopic(""); setCorrection("");
      }} />
    </Card>
  </Page>;
}
