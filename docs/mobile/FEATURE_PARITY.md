# Native feature parity and verification

The inventory is based on the authenticated Next.js routes, the corresponding
store actions and the public-account RPCs. This is a working implementation
inventory. A device or network journey needs its own evidence before moving to
Verified. Unit and SQL coverage applies to the contracts named below.

| Web workflow | Native status | Implementation and parity gaps | Local verification |
|---|---|---|---|
| Authentication and onboarding | Implemented but unverified on devices | Email/password, PKCE registration/recovery and setup with exam, date and daily target. Exact staging email templates, associated links and remaining optional profile choices need verification | Callback contract tests, types and bundles |
| Home | Implemented but unverified on devices | Study, exam countdown, due revisions, weekly priorities, habit and sleep summaries, actions and sync status | Bundles and shared selector tests |
| Daily Journal and Capture | Partially implemented | History search, dated edit, multi-subject hours, canonical topics, due revisions, weekly targets, reflection and highlights, draft retention, saved book/mock/current-affairs links and attachments on a saved day. Full day analysis and other narrative fields remain | Shared mutation tests and snapshot reconciliation |
| Roadmap and Goals | Partially implemented | Year/month/week creation, parent, titles, objective/activity/milestone tracking, archive, carry-forward, duplicate-next, period reviews, optional goal references, manual goals and progress, Study projection and editable goal details. Advanced planning and item detail variants remain | Weekly target, Goals and merge contract tests |
| Subjects and Revision | Partially implemented | Canonical topic create, search, status, confidence, shared revision queue, completion and custom items; full syllabus customization and tracker analytics pending | Topic/revision deduplication and linked habit contract tests |
| Habits | Partially implemented | Manual check-ins, new manual habits, automatic derivation, streaks, daily and weekly manual schedules, pause, archive and recent corrections. Advanced automatic-habit editing and all schedule variants remain | Shared habit tests |
| Life and Sleep | Partially implemented | Tracked measurements, reporting windows, historical readings, confirmed bedtime and morning check-in with duration correction; detailed trends and chart interactions remain | Shared Life and sleep checks |
| Personal Diary | Partially implemented | Write/edit, search and pin existing entries; rich formatting controls, category management and diary attachments remain | Shared store tests and bundles |
| Library, Current Affairs, Mock Analytics, Mistakes | Partially implemented | Read account content and create basic records. Page tracking, bookmarks, shared mock summaries and mistake review are available. Full edit flows, exports and advanced statistics remain | Unit coverage of shared calculations and bundles |
| Study Coach and Performance Review | Partially implemented | Native shared recommendations and a performance editor with shared metrics and finalized snapshots. Coach decisions are recorded. Custom periods and comparison/export reports remain | Shared selectors and bundles |
| Knowledge Graph and Study Heatmap | Implemented but unverified on devices | Search, add and remove graph links. Explore recent study activity from an accessible four-week calendar | Shared graph calculations and bundles |
| Announcements, inbox, feedback and reviews | Partially implemented | Online team updates, acknowledgement, shared notice rules, feedback text/replies, server-claimed review invitation, rating, review edits, deletion and explicit consent. Private live updates, unread indicators and acknowledgement are wired. Rich feedback diagnostics and screenshots remain | Review/feedback/ownership SQL and local web E2E |
| Device push and sleep notification action | Partially implemented | Opt-in, account token binding, native sender, receipts, route validation and a one-use bedtime record action with cold-start handling and an Android background task. OS delivery, terminated execution and rollover need staging | Push registry SQL and route/payload tests |
| Private files and account data | Partially implemented | Journal document picker, confirmed upload, shared hash deduplication, signed download for deliberate sharing, snapshot and recovery export, same-account backup merge, native delete. Inline previews, upload progress and file recovery remain | Shared file ownership SQL and local web E2E |
| Admin Center, marketing, SEO and browser PWA | Intentionally web-only | All remain in the root app. Super Admin opens the web Admin Center | Local web build and admin/account browser runs |
| Tour and contextual guidance | Partially implemented | Replayable native quick tour and contextual entry links. The web global tour remains available | Web regression suite |
| Distribution | Blocked | Requires Android SDK/ADB, a macOS/Xcode host, approved IDs, signing and physical devices | Android prebuild and both Hermes exports |

Android and iOS installation, OS accessibility, encryption and lifecycle
observations, production push and native UI performance are unverified across
the matrix. Important offline writes are implemented through the same shared
engine in code. Native OS eviction and cross-device stage journeys remain
release gates.
