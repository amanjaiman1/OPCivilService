# Daily Journal

> Daily Journal opens entries, topics and analysis at `/journal`. Use **Add entry** or **Capture today** to open [Daily Capture](daily-capture.md). The historical `/journal/history` link still opens journal records.

One entry per calendar day (`JournalEntry` in `src/lib/types.ts`, unique by
`date`). This page describes how it works now; the original design is kept at
the end as history.

## Writing a day

The composer (`components/journal/composer.tsx`) is one modal in the order a
day is usually logged: date, study (subject and hours), topics completed,
revision, how the day felt, notes, files and goals. Wins, setbacks, lessons,
books, current affairs, mocks and tags sit under **More details**, closed
unless the day already has some. There is no "are you sure?" step: **Save
entry** (or **Save changes**) saves. Closing with unsaved changes asks first.

Saving goes through `saveJournalEntry` in the store, which handles everything
the day touches in one update:

- **Changing the date moves the entry** rather than copying it, along with its
  goal links. If the new date already has an entry, the composer warns that
  saving replaces it.
- **Topics completed** lets you choose a subject, pick a matching syllabus
  topic or add a custom topic under that subject. With one study subject in
  the entry, the picker suggests that subject. You can still save a topic as
  unassigned.
- A subject-linked completion brings an untouched topic up to Learning and
  schedules its first revision by default. The first due day is the day after
  study, with today as the earliest due date for a backfill. Use the checkbox
  to opt out before saving.
- **Revision** logged against a queue item advances the schedule once per day.
  A backfill records the past pass and keeps any later schedule.
- **Your weekly targets** updates objectives, activities and milestones in the
  Roadmap. A completed item links to the journal day when both are saved.
- **Goals this day served** links the day to goals; the goal shows the day and
  its files.
- The day's **first real entry marks the day accomplished** and plays the
  celebration. (The morning check-in used to create an empty placeholder entry
  first, so this never fired.)

## Files

Photos, PDFs, notes and documents can be attached to a day: up to 10 per day
and 5 MB each, with phone photos resized first. They're stored once in private
cloud storage, can be previewed, replaced and removed, and goals and Life
Dashboard days can link to them without copies. See
[attachments](./attachments.md).

## Topics completed

Old entries kept topics as plain text. `upgradeEntryTopics` (in `lib/topics.ts`)
links each one to the syllabus when the name matches exactly one topic, and
leaves it as your own topic otherwise; it runs in the v12 store migration and
on every snapshot pulled from the cloud. Nothing is guessed: "Introduction",
which exists in several subjects, stays unlinked.

New records resolve by ID first, then by a unique exact case-insensitive name
within the selected subject. The comparison trims and collapses whitespace.
If more than one topic matches, pick the intended record. New custom topics
become part of that subject's syllabus and count in its totals. Syllabus and
revision IDs keep their links when a topic is renamed. Queue IDs and history
from older accounts are preserved when a unique old name can be linked.
Removing a journal entry removes its journal evidence and its planning links.
Syllabus progress and schedules already earned are retained. Removing a topic
from the syllabus keeps the journal label and the revision history readable.

## Finding things

`/journal` has three views:

- **Entries**: search across notes, topics, wins, books, revision, tags, subject
  names and file names; filters for subject, date range, sort, and *Has files*,
  *Has mock*, *Wins logged*. Grouped by month, 45 days at a time.
- **Topics** (`components/journal/topics-explorer.tsx`): every completed topic
  joined to the syllabus, the revision queue and the mistake notebook. Search by
  topic, subject or paper; filter by subject, source (syllabus or your own),
  status, revision state and date range; sort by recent, oldest, name, times
  done or subject. Select topics to **add them to revision**, **mark revised** or
  **mark mastered** together. Each topic opens its subject
  (`/subjects?subject=<id>`) or the days it was recorded.
- **Analysis**: the patterns across days, as before.

`/journal/<date>` shows one day in full, with its files, the goals it served,
the topics it completed (linked to their subjects) and the Life Dashboard
readings for the same date.

## History: the original module design

> Every day of preparation becomes a separate, permanent historical record. A
> candidate should be able to open any date — years later — and *relive* it:
> what they studied, how they felt, what they won and lost, and the photos that
> framed the day.

### 1. Database schema

The journal is keyed by **one entry per calendar day** (`date` is unique). It is
defined in `src/lib/types.ts` and persisted via the Zustand store (localStorage
today; trivially swappable for a relational backend).

```
JournalEntry
├─ id                string            stable id ("j-YYYY-MM-DD")
├─ date              ISODate (unique)  the day this record belongs to
│
│  ── daily rhythm ──
├─ wakeTime          "HH:MM"?          when the day started
├─ sleepTime         "HH:MM"?          when they went to bed
│
│  ── study ──
├─ blocks            StudyBlock[]      { subjectId → Subject, hours, topics[] }
├─ totalHours        number            derived sum of block hours
├─ topicsCompleted   string[]
├─ booksStudied      BookRead[]        { bookId?, title, fromPage?, toPage? }
├─ revisionSessions  RevisionSession[] { subjectId?, topic, minutes? }
├─ mocksAttempted    MockRef[]         { mockId?, name, score?, max? }
├─ currentAffairs    CARef[]           { caId?, title, source? }
│
│  ── state of mind (1–5) ──
├─ mood              number
├─ energy            number
├─ motivation        number
├─ focus             number
│
│  ── narrative ──
├─ wins              string[]
├─ failures          string[]
├─ lessons           string[]
├─ highlights        string?           one-line headline of the day
├─ reflection        string?           free-form personal reflection
├─ tags              string[]
│
│  ── memory ──
└─ attachments       Attachment[]      { id, kind: image|file, name, dataUrl, caption?, size? }
```

**Relationships.** A `StudyBlock` references a `Subject`; `booksStudied`,
`mocksAttempted`, `currentAffairs`, and `revisionSessions` carry optional foreign
keys (`bookId`, `mockId`, `caId`, `subjectId`) so an entry can deep-link into the
Library, Mock Analytics, Current Affairs Vault, and Subject modules later.
Attachments store downscaled JPEG/`dataUrl`s (images are resized to ≤1280px,
quality ~0.72) to stay within localStorage limits.

**Migration.** The store is at persist `version: 2`; a `migrate()` backfills the
new fields (motivation, wins/failures/lessons, books, revisions, mocks, current
affairs, attachments) onto any v1 entries so older data renders cleanly.

#### Relational mapping (future backend)

```
journal_entries(id, user_id, date, wake_time, sleep_time, total_hours,
                mood, energy, motivation, focus, highlights, reflection)
study_blocks(id, entry_id, subject_id, hours)
entry_topics(entry_id, topic)            entry_wins(entry_id, idx, text)
entry_books(entry_id, book_id, title, from_page, to_page)
entry_revisions(entry_id, subject_id, topic, minutes)
entry_mocks(entry_id, mock_id, name, score, max)
entry_current_affairs(entry_id, ca_id, title, source)
entry_failures / entry_lessons / entry_tags (entry_id, idx, text)
attachments(id, entry_id, kind, name, url, caption, size)
```

### 2. UI wireframe

**List / timeline** (`/journal`)

```
┌───────────────────────────────────────────────────────────────┐
│  DAILY STUDY JOURNAL                              [ + New entry]│
│  Every day, written down.                                       │
├───────────────────────────────────────────────────────────────┤
│  [🔍 Search reflections, topics, wins, books…]   [ Filters (2) ]│
│  ▸ Subject ▾   From ▾   To ▾   Sort ▾                            │
│  ( Has mock ) ( Has photos ) ( Wins logged )         Clear all  │
│  312 entries                                                    │
├───────────────────────────────────────────────────────────────┤
│  June 2026                              23 days · 198h          │
│  ┌────┐  6h 30m  · Polity · Economy · +2          Today    ✎ 🗑 ›│
│  │ 12 │  Finished Fundamental Rights revision                   │
│  │ THU│  Mood · In flow   🏆 2   ◎ mock   ▣ 1                    │
│  └────┘                                                         │
│  ┌────┐  8h  · PSIR · Ethics                       Yesterday   ›│
│  │ 11 │  …                                                      │
│  └────┘                                                         │
│  May 2026                               26 days · 232h          │
│  …                                                              │
└───────────────────────────────────────────────────────────────┘
```

**Day detail / "relive"** (`/journal/[date]`)

```
┌───────────────────────────────────────────────────────────────┐
│  ← Journal                                          [ ‹ ] [ › ] │
│  DAY 312 OF THE JOURNEY                                          │
│  Thursday, 12 June 2026                            [ Edit ] [🗑] │
├───────────────────────────────────────────────────────────────┤
│  ┌ Daily rhythm ┐  ┌ State of mind ───────────────────────────┐│
│  │ Wake   05:30 │  │ Mood ▰▰▰▰▱  Energy ▰▰▰▱▱                  ││
│  │ Sleep  23:20 │  │ Motivation ▰▰▰▰▱  Focus ▰▰▰▰▱             ││
│  │ Studied 6h30 │  └──────────────────────────────────────────┘│
│  └──────────────┘                                               │
│  ┌ Study breakdown ───────────────────────────────────────────┐│
│  │ Polity · Fundamental Rights      ▓▓▓▓▓▓░░  3h                ││
│  │ Economy · Inflation              ▓▓▓░░░░░  2h                ││
│  └─────────────────────────────────────────────────────────────┘│
│  [Topics] [Books p.10–48] [Revision] [Mocks 121/200] [CA · Hindu]│
│  ┌ Wins ┐  ┌ Failures ┐  ┌ Lessons ┐                            │
│  “One line that captures the day”  + reflection paragraph        │
│  ┌ Photos & attachments ─ gallery (click → lightbox) ──────────┐│
└───────────────────────────────────────────────────────────────┘
```

### 3. Daily entry flow

1. **Trigger** — "Log today" (top bar / dashboard), "New entry" (journal), or
   "Create this entry" on an empty day detail. ⌘K → Daily Journal also works.
2. **Compose** — a single sectioned modal: Daily rhythm → Study blocks →
   Topics/Books/Revision/Mocks/Current affairs → State of mind (mood, energy,
   motivation, focus) → Wins/Failures/Lessons → Highlight + Reflection → Tags →
   Photos. Lists use chip/row editors; images are auto-compressed on drop.
3. **Save** — `totalHours` is derived from blocks; the entry is **upserted by
   date** (editing today simply updates it). The heatmap, streak, habits and
   dashboard update instantly.
4. **Relive** — clicking any row opens `/journal/[date]`, a full diary view with
   ‹ / › navigation to the adjacent day (you can browse straight through the
   year). Editing re-opens the same composer pre-filled.

### 4. Search & filtering

- **Search** runs across reflection, highlight, wins, failures, lessons, topics,
  tags, book titles, current-affairs titles, revision topics, and subject names.
- **Filters**: subject, date range (from/to — built for "revisit years later"),
  sort (newest/oldest), and quick toggles — *Has mock*, *Has photos*,
  *Wins logged* — which AND together. An active-filter count shows on the button.
- **Grouping**: results are grouped under sticky **Month YYYY** headers, each
  showing day count and total hours, so a multi-year journal stays browsable.
