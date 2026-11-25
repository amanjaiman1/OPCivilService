# Daily Capture

**Daily Journal** in the sidebar opens the journal at `/journal` with the
Daily Capture form over it: a popup with four tabs for the day, saved together
with **Save All Changes** (or Ctrl/⌘ + S). A full save closes the form;
closing with unsaved edits asks first and keeps them as a draft. The journal's
"Capture today" button opens the form again.

| Tab | What it edits | Saved through |
|---|---|---|
| Day Update | the day's journal entry and weekly targets | `saveJournalEntry` or `completeWeeklyTargets` |
| Life | the day's Life Dashboard readings (only the tracked fields) | `upsertLifeEntry` / `deleteLifeEntry` |
| Goals | the account's own goals: a new total, milestones, status, a note, and "Worked on this" (links the journal day) | `logGoalProgress`, `toggleGoalMilestone`, `setGoalStatus`, `addGoalNote`, `setGoalJournalDates` |
| Habit | manual check-ins; connected habits are shown as the Habit Engine reads them | `toggleHabit` |

The address keeps the day and tab: `/journal?date=2026-11-18&section=goals`.
`/journal?new=1` opens today's Day Update. Behind the form is the journal
itself (entries, topics, analysis; `components/journal/journal-list.tsx`);
`/journal?tab=topics|analysis` and `/journal/history` show it without the form. The standalone Goals, My Habits and Life Dashboard pages are
unchanged.

## Layout

The form opens on the day: a week strip (logged days have a green dot, days
with unsaved edits an amber one, and the calendar button jumps anywhere) and
four one-line tabs, each with its figure. Day Update leads with its two most
important parts, **Study** and **Topics completed**, as large cards. Study
shows the day's total against the daily target and the split by subject;
rows work as in the entry dialog ("Add a subject" adds an empty row), with
half-hour steps on each row. Revision, how the day felt, reflection, files
and the more detailed lists follow. Every tab lays its sections out in one
bordered sheet, divided by hairlines. The tabs are compact icon tiles in
one bar of liquid glass, joined by links that take the colours of the
sections they connect (green between finished ones), with light running
along them; a tinted lens glides to the selected tab.

On a phone the bottom bar is a single "+" button (`CaptureButton` in
`components/layout/bottom-nav.tsx`) that opens Daily Capture; every other page
is in the menu at the top left. Until today is logged the button has a soft,
breathing halo; once it is, it carries a check. In the demo, /journal opens
without the form so the guide can talk the visitor through it first.

## Weekly targets

Day Update groups the unarchived weekly plans whose saved dates cover the
selected day. Dated work for that day appears first, followed by overdue
work, undated weekly work and upcoming milestones within the plan. Overlapping
weeks keep their own headings. Deferred and carried originals are excluded.
A matching topic can highlight an objective. Checking it is what requests
completion.

Planning selections are kept with the day's draft and restored after a reload.
Saving writes the desired state to each original Roadmap item. A status or
target changed on another device may require reselecting that item. A change
already applied elsewhere is safe to retry. If a journal is saved at the same
time, the link and completion are saved together. A planning-only save uses
an existing entry when available and can otherwise finish without creating a
journal entry. The completion day comes from the date selected in Daily Capture.

## No new data

Daily Capture stores nothing of its own. The forms are the same components
the entry dialog and the Life Dashboard dialog use
(`components/journal/journal-editor.tsx`, `LifeFields` in
`components/life/life-form.tsx`), and saving goes through the store, so the
account-scoped persistence and the versioned `save_chronicle_state` sync are
untouched.

## Saving

`saveAll` in `components/capture/capture-workspace.tsx` applies only the tabs
with changes, in this order: journal entry, life entry (it mirrors bedtime and
wake-up onto the journal), goals, check-ins. Each section succeeds or fails on
its own; failed sections keep their edits and show why. It then waits for the
cloud (`flush`) and the header says whether the changes are synced, still on
their way, or kept on this device while offline. If both local storage and sync
fail, Capture stays open and allows the account snapshot to be retried.

- If the day's entry or readings changed on another device or tab after
  editing began, saving asks before replacing them.
- Retries can't double-apply anything: goal and habit drafts hold wanted states
  and are measured against the records at save time (`lib/daily-capture.ts`),
  goal readings are one per day, and a saved goal's draft (with its note) is
  cleared.
- Connected habits are never written to. The Habit Engine derives them from
  the saved journal, life and revision records, with one event per source
  record, so a journal entry can't complete a habit twice.

Goal readings, milestones and notes recorded for an earlier day carry that
day's date. A reading for an earlier day joins the history without moving the
goal's current figure, which is always its latest reading.

## Drafts

Unsaved edits are kept in this browser tab's sessionStorage, per account and
day (`upsc-capture-draft:<account id>:<date>`), so a reload, another page or
another day doesn't lose them. Switching days keeps each day's edits under its
own key, and the page lists other days still waiting. Closing or reloading the
tab with unsaved edits asks first.
