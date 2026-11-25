# Phase 02 · App shell and entry experience

## Audit

The work started from `7e71275` on `main`, which includes the Phase 01
merge. The Phase 01 topic, revision, habit and weekly-target paths were
inspected in the source, and the baseline's 324 automated tests passed.

The journal route previously owned the Capture overlay. Ordinary journal
navigation could open a form that obscured the records, and launching from
another page could replace the page beneath it. The desktop rail repeated
six sidebar destinations. On the phone, the single entry button was
already easy to find but linked away from the current task. Life opened
with the full sleep card, pushing the other tracked fields below the fold.
The broad product tour helped orientation but did not offer short guidance
for a specific action.

## Decisions and implementation

| Workflow | Before | After |
|---|---|---|
| Browse a day | Journal navigation opened a full day form over the records | Daily Journal starts with entries, topics and analysis. Historical editing stays in the journal. |
| Log from another module | The entry action opened the journal route | **Add entry** opens Capture over that module. Closing returns focus to its trigger. |
| Desktop navigation | The rail and sidebar repeated destination links | The rail contains Home, account, capture and utilities. The sidebar groups page destinations. |
| Phone entry | The button opened Capture on another route | The safe-area button opens the same workspace in place. |
| Track Life measurements | Sleep occupied the largest area before other fields | Movement, body readings, focus and sleep use comparable groups, with a compact sleep control. Notes and files sit under an expandable section. |
| Find help | One broad feature tour | Entry-capable pages share a replayable guide with page-specific steps and a simulated action. |

Home uses the existing `/dashboard` route. The rail delegates sleep quick
actions to the same logic used by the Life Dashboard. These actions keep
their current eligibility and persistence behavior.

### Capture ownership

`CaptureProvider` lives in the authenticated app shell and is keyed to the
account. Its state contains only the requested day and tab, originating
pathname and focus target. It loads the work area on demand. The controller
leaves the address unchanged for in-place opening and places a browser
history entry so Back closes Capture before leaving the page. Explicit
journal links are read by the shell, which clears the capture parameters
on close while preserving unrelated query values and anchors. Active
explicit links can restore their drafts after a reload. The historical
`/journal/history?new=1` composer link is still supported.

The workspace and dedicated editors continue using the same journal,
revision, roadmap, goal, wellbeing and habit actions. Study owns the
journal and weekly target draft. The date field switches the account- and
date-scoped draft. Changing date is blocked during an in-flight save.
The save footer distinguishes local persistence and cloud sync, keeps
failed sections available for correction, and no longer opens a celebration
over routine Capture saves. The historical composer keeps its own workflow.

General modals still provide a shared focus trap and Escape ordering.
Capture and guide controls use visible focus, text-based status and
keyboard navigation. The entry guide is a mode of the existing tour
provider. Simulated actions use in-memory React state and never call a
store action. The guide stays separate from the existing full tour steps.

## Entry workflow audit

| Page | Entry points and inputs reviewed | Phase 02 treatment |
|---|---|---|
| Home | Global and contextual study logging | In-place Capture, explicit Home title, action rail and entry guide |
| Daily Journal, history and day view | Capture today, browse views, edit a saved entry, revision, topic and attachment fields | URL-addressable browsing views, shared Capture, unchanged historical editor and guide |
| Subject Progress | New subject, add topic, edit subject or topic, status and revision queue | Dedicated inline controls, stronger shared field focus and a subject guide |
| Revision | Add or edit queue item, recall or forget | Existing queue actions and schedule, with a contextual recall demonstration |
| Goals | New goal, category creation, status, manual readings, milestones and notes | Direct Goals-tab shortcut from goal detail, shared fields and guide |
| Roadmap | Create or edit plan, add objective/activity/milestone, complete/reopen, carry forward, review | Existing independent planning, direct weekly targets in Capture and contextual guide |
| My Habits | Preset or create, configure schedule/connection, manual check-in and corrections | Existing connected evidence and manual controls, Capture tab and habit guide |
| Life Dashboard and metric pages | Today, historical readings, tracked fields, direct sleep quick actions, notes and files | Balanced Capture groups, compact sleep and rail access to existing quick actions, field guidance |
| Mock Analytics | Add or edit total and section scores, delete, inspect scores | Dedicated score editor and shared controls, mock guide |
| Current Affairs | Add/edit headline, summary, category, source and tags | Inline required-headline error, labelled optional fields and guide |
| Library | Add title, author, status and page counts, update progress | Inline title error, reading position hint and guide |
| Mistake Tracker | Topic or question, correction, review outcome and status | Inline either-or error, optional detail labels and review guide |
| Knowledge Graph | Select node, link topics, manage relationship | Existing graph editor and relationship guide |
| Personal Diary | Write, edit and delete a dated entry | Dedicated private editor and guide that explains diary isolation |
| Performance Review | Pick period, write reflection, save draft or complete | Dedicated multi-step workflow and review guide |
| Study Coach | Inspect evidence, apply, defer or dismiss a suggestion | Existing confirmation semantics and guide |
| Heatmap and Announcements | Read-only views | Navigation retained, shared shell |
| Account and Settings | Profile, appearance, data and preferences | Existing controls and guards, accessible from sidebar and rail |

Specialized editors keep their module-specific validation and transaction
behavior. The shared form and modal improvements apply wherever those
primitives are used. The focused browser test avoids issuing real
notifications or writing to a production account.

## Visual evidence

| Screen | Before | After |
|---|---|---|
| Desktop navigation | [Original rail](phase-02-evidence/before-desktop.png) | [Home and action rail](phase-02-evidence/after-desktop.png) |
| Life in Capture | [Sleep-first layout](phase-02-evidence/before-life.png) | [Tracked metric groups](phase-02-evidence/after-life.png) |

[Mobile Capture](phase-02-evidence/after-mobile.png) · [Replayable guide](phase-02-evidence/after-entry-guide.png)

The before screenshots use the existing sample account. The after
screenshots use the local browser test account. Both were visually inspected.
Viewport checks cover 320 and 390 px phones, 768 px tablet portrait,
1024 px landscape and wide desktop. Keyboard checks exercise opening,
tab selection, focus restoration and the review guide. Browser tests use
three theme tokens through the account flows and a reduced-motion Capture
pass. A real mobile keyboard, native screen reader and complete WCAG audit
remain outside the local browser harness.

## Verification and performance

| Check | Result |
|---|---|
| `npm test` | 328 passed. Four added cases cover URL parsing, date validation, query cleanup and guide coverage. |
| `npm run test:db` | Passed the isolation, platform, trust, help, live update, presence and sync safety suites. |
| `npm run lint` | Passed. |
| `npm run check:classes` | Passed. |
| `npx tsc --noEmit` | Passed. |
| `npm run build` | Passed on the Phase 02 source in an isolated checkout. |
| `npm run test:e2e -- --no-build` | All 23 account and data safety scenarios passed. |
| `npm run test:e2e:admin -- --no-build` | All 28 admin, demo, feedback and refresh scenarios passed. |
| `npm run test:e2e:admin -- --no-build --refresh-only` | All three Refresh Data scenarios passed after the audit check waited for the initial rows to render. |
| `npm run test:e2e -- --phase-01` | Passed after restoring reload behavior for active Capture links. |
| `npm run test:e2e -- --no-build --phase-02` | Passed with the expanded checks for dark and reduced motion, all nine tracked Life fields, a saved zero reading and correction of a validation error. |

The mobile navigation probe passed cold and warm visits to the 13 tracked
routes and both in-page links. Daily Journal showed content in 731 ms on
the first visit and 325 ms on the second in the simulated mobile profile.
The full `perf:measure` suite and its separate
compute, render and bundle probes were not run. The route bundle comparison,
targeted desktop timings and mobile navigation probe cover the changes here.

The workspace and guide dialog use separate on-demand chunks. Switching
tabs keeps visited forms mounted so editor state survives. Continuous tab
and entry-button animations were removed.

The Chromium lab ran five desktop attempts per build with the sample
account in production mode. Each attempt started on Subject Progress.
Navigation timing ends when the destination heading is visible.
Capture timing ends when the Life tab becomes visible.

| Measure | Baseline | Phase 02 |
|---|---:|---:|
| Subject Progress to Daily Journal, median | 358 ms | 333 ms |
| Entry action to visible Capture, median | 516 ms | 568 ms |
| First Capture attempt | 683 ms | 565 ms |
| Daily Journal first-load JS | 387 kB | 349 kB |
| Home first-load JS | 298 kB | 305 kB |

The click-to-dialog measurements varied from 451 to 784 ms in the changed
build. The five-sample run found a slower median and a faster first attempt.
The design removes the route navigation from the entry action and reduces
the Journal route's initial bundle, but the split Capture chunk still has
a first-use cost. This is a local sample, with no production traffic or
mobile network extrapolation.

## Phase 03 handover

Continue using the existing sleep quick-action hook and store mutation for
the rail, gating and Life Dashboard. The compact Capture presentation can
accept Phase 03 refinements without changing who owns a night or how a
draft is saved. Use the Capture controller for new section actions and
retain the origin, date, permissions and focus contract. No schema change
is required for Phase 02.
