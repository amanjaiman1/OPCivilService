# Phase 01 implementation report

## Executive summary

A student can record a topic once in Daily Journal or Daily Capture and see
its study credit and revision schedule. A weekly plan works on its own.
Objectives, activities and milestones can be completed from the daily entry
and are reflected in the original plan and its review. The Goals page
groups existing goals by category.

The implementation is based on `f24ccc138f785ecb8fafdbb02cab89a426b953a1`
from `amanjaiman1/OPCivilService`. The Git checkout was clean at the start.
Changes remain in the working tree.

## Audit findings and changes

| Area | Finding | Implementation |
| --- | --- | --- |
| Topic entry | Free text had no subject or canonical topic ID. | The shared picker accepts a subject, searches existing topics and offers to create a topic in that subject. It supports unassigned topics. A unique exact match ignores case and repeated whitespace. Ambiguity requires an explicit choice. |
| Subject Progress | The journal could credit only an already linked syllabus item. Some topic mentions used name matching across subjects. | The journal resolves and saves canonical IDs with the completion. A new custom topic becomes part of the subject's syllabus totals. First study moves an untouched topic to Learning. Existing learning, confidence, revision counts and mastery keep their values. |
| Revision queue | Name-based queue matching could break after a rename. A slightly earlier journal pass could rewind a later schedule. | The same save schedules a first pass by default and reuses an existing queue item. Legacy matches keep their queue IDs and history. Past first-pass dates roll forward to today. Backfills add history without replacing a later schedule. |
| Revision habits | The activity engine already deduplicated linked passes, but the setup exposed a count even for the standard daily habit. | A standard Revision habit completes after one pass. Custom targets stay available. Linked entries and unambiguous same-day matches share one event. Journal-only corrections change habit credit without removing independent Revision activity. |
| Weekly work | Objectives were plain strings. Milestones had status controls but were easy to miss. | Weekly objectives use the existing Roadmap item model. Objectives and milestones have accessible complete and reopen controls. Their counts appear independently of the activity percentage. |
| Daily Capture and Journal | Daily entries could only link planned work indirectly. | The shared editor resolves applicable weeks by date and stages explicit requested states. A combined save updates the journal and original Roadmap items together. A planning-only save can link an existing entry or finish without creating one. |
| Reviews | The plan review showed mainly live activity lists. | It reads completed objectives, activities and milestones, open, deferred and carried work, and journal totals. Saving freezes the evidence with optional reflection. Performance Review displays separate objective and milestone counts. |
| Goals | Categories appeared as a filter on one list. | Goals group by the existing category order. Search, filters and sorting work within the grouped presentation. Legacy entries fall back to the category implied by their metric. |

## Ownership and compatibility

- **Subjects and Revision.** Subjects own canonical topics. Revision owns
  queue items and pass history. Journal completion IDs and auto-queue IDs use
  canonical topic IDs. New custom topic IDs are deterministic within a subject
  so concurrent saves converge. Topic deletion preserves readable journal
  labels and queue history.
- **Journal and habits.** The journal owns study and revision evidence. The
  shared activity layer derives habit credit, streaks, reminders and Study Coach
  and Performance Review figures. Removing a journal completion preserves
  the established syllabus progress and queue schedule. Legacy passes without
  known provenance are treated as existing history.
- **Roadmap.** Roadmap owns every planning item. Goals and journal dates are
  references. Completion stores both the save timestamp and a calendar date.
  The selected day drives calendar credit across time zones. A review stores
  the recorded evidence as it appeared at save time.
- **Sync.** Snapshot version 18 migrates legacy weekly objective strings in
  their original order into incomplete items. IDs are based on text and its
  occurrence. The base and both compared copies use the same migration before
  merging. Plan items merge by ID. Conflicting review evidence stays together,
  with the usual conflict record. An older client reloads before it can
  overwrite a version-18 cloud copy.
- **Database.** One additive migration extends the service-only reminder
  projection to carry the activity completion date. It adds no table or
  column and changes no RLS policy or grant. Deploy the projection before or
  alongside the app so server-side Roadmap reminders use the same dates as
  the client. Reinstalling the preceding projection is a compatible rollback
  for the reader. It leaves saved dates in account snapshots.

## Changed files

| Area | Files |
| --- | --- |
| Journal, topics and revision | `src/lib/{store,topics,subjects,revision,types}.ts`, `src/components/journal/`, Subjects and Revision pages |
| Planning and review | `src/lib/{roadmap,performance}.ts`, `src/components/roadmap/`, `src/components/reviews/review-figures.tsx` |
| Daily Capture, habits and Goals | `src/components/capture/capture-workspace.tsx`, `src/components/habits/habit-form.tsx`, `src/lib/{habit-engine,goals}.ts`, Goals page |
| Account and notifications | `src/lib/account/scope.ts`, `src/lib/sync/`, `supabase/migrations/20261217120000_dispatch_activity_completion_date.sql` |
| Verification | `tests/phase-01.test.ts`, account-isolation and topic tests, browser scenarios, mock Supabase and RLS checks |
| Documentation | Accounts, Connected Ecosystem, Daily Capture, Daily Journal, Habit Engine and Roadmap docs |

## Browser evidence

The screenshots show a fresh mock account using an independent weekly plan.
The desktop capture restored the checked targets and topic from a tab draft.
The phone-sized session received the completed objective from the cloud.
The browser checks also verified the 44-pixel completion control and the
absence of horizontal overflow at 390 pixels.

- [Weekly targets in desktop Daily Capture](evidence/weekly-targets-desktop.png)
- [Weekly objectives at a 390-pixel mobile viewport](evidence/weekly-objectives-mobile.png)

## Verification

| Command | Result |
| --- | --- |
| `npm test` | 324 passing tests, compared with 312 at baseline. |
| `npm run test:db` | Schema and 14 migrations applied twice. Isolation, platform, trust, help, live updates, presence and sync safety checks passed. |
| `npm run lint` | Passed. |
| `npm run check:classes` | Passed across 358 files. |
| `npx tsc --noEmit` | Passed. |
| `npm run build` | Production build passed. |
| `npm run test:e2e` | All 23 account, sync and product regression scenarios passed on the baseline and Phase 01 builds. |
| `npm run test:e2e -- --phase-01` | Focused desktop, mobile and cross-device scenario passed. |

The default Playwright browser download was unavailable in the workspace.
The browser suites use a local Chrome for Testing headless binary through
`PLAYWRIGHT_BROWSERS_PATH`. They run against mock Supabase.

## Security, performance and handover

Account scoping and versioned writes still go through the existing mechanisms.
The revised reminder projection exports the date along with the previous
completed-activity fields. Its SQL test still checks that private Roadmap text
and review content stay outside the payload. Capture reports the failure when
both local persistence and cloud sync fail, with a retry of the in-memory
snapshot.

The subject-linkage index joins records in one pass. Weekly target resolution
is memoized per plan collection and date, and the shared save sets journal,
syllabus, revision and Roadmap changes in one mutation. Reviews materialize
their evidence on demand. In the repository's heavy synthetic account, the
weekly Performance Review median was 0.75 ms versus 0.77 ms at baseline and
notification evaluation was 14.67 ms versus 14.64 ms. Resolving one day of
weekly targets across 104 synthetic plans had a 0.026 ms median. These are
local Node measurements. Production traffic, production reminder delivery
and device-specific mobile browsers were outside local verification. Two
upgraded clients converge on the same ID for the same custom topic. During
the rollout window before the first version-18 cloud save, an old client can
still create a same-name item with its legacy ID. Existing ambiguous records
remain available for manual reconciliation.

Phase 02 should reuse the shared `JournalFields` and `WeeklyTargets`,
`saveJournalEntry` and `applyWeeklyTargets` paths. Keep the source record IDs,
calendar completion date and explicit requested state when changing UI or
adding entry points. Dispatch and sync should continue to consume the same
account data. The migration and code have not been deployed.
