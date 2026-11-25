# Daily Capture

**Daily Journal** opens the browsing experience at `/journal`. Switch between
entries, topics and analysis, or open a saved day to edit it. Use **Add entry**
on the desktop rail, the mobile **+**, or **Alt+N** to open **Daily Capture**
over the current page. The shortcut leaves text fields and other dialogs
alone. Contextual actions can open a section directly.

| Tab | What it edits | Saved through |
|---|---|---|
| Study | Journal entry, revision sessions and weekly targets | `saveJournalEntry` or `completeWeeklyTargets` |
| Life | Tracked readings with optional notes and file links | `upsertLifeEntry` / `deleteLifeEntry` |
| Goals | Readings, milestones, status, notes and optional journal links | Existing goal actions |
| Habits | Manual check-ins and connected habit evidence | `toggleHabit` and the Habit Engine |

Explicit links such as `/journal?new=1` and
`/journal?date=2026-11-18&section=life` still work. Closing Capture clears the entry parameters and keeps unrelated journal
views and anchors. Reloading an active entry link restores the draft. Normal journal
navigation opens the journal on its own. The address of the current page stays
the same when Capture is opened from a global button. Browser Back closes the
workspace before leaving that page. Closing restores the opener’s focus.

## Layout

Use the week strip or the date field to change days. The four tabs show
the selected section and its status. The footer keeps **Save All Changes**
within reach while the form scrolls. Study surfaces time, topics and weekly
targets ahead of optional detail. Life groups movement, body readings,
focus and sleep. Blank readings stay unrecorded and a typed zero is a value.
Use **Choose fields** to change which measurements appear.

The **Entry guide** walks through the form and gives you a sample action
that has no effect on your account. It uses the same guidance controls as
the other entry pages.

## Weekly targets

Study groups the unarchived weekly plans whose saved dates cover the
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
