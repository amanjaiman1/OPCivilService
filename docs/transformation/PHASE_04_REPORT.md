# Phase 04 · Engagement, administration and web release

## Baseline and scope

The implementation starts from `6959f59` on `origin/main`, including the
Phase 03 merge. The three phase reports and the review, notification, admin,
presence, file and snapshot contracts were audited. Baseline unit tests passed
335 cases. The existing review submission, moderation and consent workflows
remain the authority. The existing sync engine verifies account ownership and
holds destructive replacements. Release verification is local.

## Engagement and review invitations

Platform settings control eligibility, global enablement, the local reminder
time (default 19:00), the date interval and postponement. Use the saved profile
zone or the device’s valid IANA zone when no profile zone is available. The
database excludes accounts with a review of any status and preserves previous
dismissals. A reserve/show protocol uses a 45-second lease and locks one
account row. A released or expired reserve can be retried. Once shown, the
date guard and a minimum elapsed interval prevent time-zone changes and other
devices from repeating it. A display acknowledged just before a tab closes
may consume the day. The next eligible day provides recovery. A cached
pre-upgrade client can still have the legacy dashboard card until it refreshes.

The popup uses the existing shared modal stack and waits for open Capture or
tour interactions before finalizing a claim. Closing it leaves the current day
consumed. Maybe later applies the configured cooldown and permanently stops
prompts after the third postponement. Don’t ask me again dismisses permanently.
The review wizard still requires its normal feedback and publication consents.

The first-study rule uses positive journal time, a saved mock, or an explicit
revision pass as meaningful work. It runs during the first seven days after
setup within the existing notification timing and limits. Empty drafts and
default readings never count. Home also offers the same rule’s action through
the Capture controller, without asking for permission again. Server push
excludes suspended or deleted accounts and requires the trimmed snapshot RPC.

## Resource usage

| Metric | Method | Coverage |
|---|---|---|
| Snapshot footprint | Server counts UTF-8 bytes of the serialized JSONB snapshot and caches the size as rows change | Current logical bytes, separate from indexes, history and physical Postgres storage |
| Attachments | Storage object sizes in the private attachment bucket, matched by account path | Counts objects once, including orphaned objects in the platform total. Missing metadata is counted separately |
| Transfer | Browser batches estimated serialized snapshot UTF-8 bytes for full pulls and save, init or confirmed-replace calls | Excludes protocol, compression, CDN, heads, attachments, old clients and lost batches. An attempted upload may fail before reaching the network |
| Sync activity | Bounded batch sums of pull/save attempts, successes, failures and conflicts | Last successful sync is the latest received batch containing a success |
| Presence | Latest observed activity in the selected UTC window | Uses the existing presence feature, with no additional session tracking |

Usage access requires both analytics and user-read permission, enforced by the
database. Rows contain metrics and authorized account identifiers. There is no
raw snapshot, attachment content, or private prose in usage responses or
telemetry. The history begins when instrumentation runs. Daily samples store up
to 90 days of aggregate footprint, and sync aggregates and replay receipts
expire after 35 days when the daily sampler runs. Account deletion cascades
per-user metadata. Supabase Usage remains the billing authority.

Per-account transfer batches allow at most 256 operations, have bounded byte
values, and accept at most 120 batches per UTC day. The browser holds two
in-memory aggregates and retries a batch ID after a transport error when sync
resumes. An app closed before a flush can lose estimates. Snapshot footprint
updates on state writes. The resource route scans attachment metadata in one
grouping query, aggregates only the selected telemetry window, and returns at
most 50 accounts. This page refreshes on demand, so ordinary sync traffic does
not trigger another aggregation.

## Administrative attention

Review submissions and pending edits, new feedback and active crash groups
advance transactional section cursors. Counters come from pending review
statuses, open feedback without a response, and new crash groups. An
administrator explicitly acknowledges the displayed summary cursor. It
cannot consume a later update and does not moderate a review, answer
feedback or resolve a crash. The acknowledgement follows the administrator
across sessions and devices. Realtime refresh reuses the existing
role-aware channel, and manual refresh and foreground checks provide fallback.

## Security, compatibility and operations

The original lockfile’s production audit found critical Next.js advisories
and high-severity transitive dependencies. The release branch updates Next.js
to 15.5.29, updates route parameter handling and patches the audited
transitives. The lockfile production audit is recorded below. The background
sleep RPC rejects suspended users, and a schema 19 floor protects timezone and
duration provenance from older writers. Snapshot data is preserved.

Physical-device Web Push, true concurrent PostgreSQL staging and real traffic
query costs remain release checks. Use the [release checklist](WEB_RELEASE_CHECKLIST.md)
and [native readiness inventory](NATIVE_READINESS.md). No production campaign,
migration or deployment was performed.

## Traceability

| Brief | Implementation | Evidence |
|---|---|---|
| Review scheduling, consent and overlay coordination | Review invitation schedule migration, ReviewInvitation and existing wizard | Web release SQL, trust SQL and admin browser invitation |
| Activation and completed-action suppression | Notification rule, Home Capture action and dispatcher filters | Notification unit and database tests |
| Usage, bounded transfer and privacy | Resource Usage page, instrumented sync transport and usage migration | Database aggregation and role tests, admin browser |
| Persistent administrative attention | Transactional cursors, admin navigation summary and refresh | SQL role, stale cursor and resolution tests, admin browser |
| Sync compatibility and recovery | Schema 19 metadata-preserving guard | Database stale-writer and sync-safety tests |
| Release and mobile readiness | Web release checklist and native readiness inventory | Local verification and separate staging gates |

### Verification and evidence

| Check | Result |
|---|---|
| TypeScript, lint, source class check and production build | Passed with Next.js 15.5.29 |
| Unit tests | 336 passed |
| Local database | Nine suites passed. All 19 migrations applied twice, including the stale-client guard and account isolation |
| Account browser suite | 23 scenarios passed on local Chromium and mock Supabase. The Phase 01, 02 and 03 desktop and mobile regressions also passed |
| Browser route coverage | 20 authenticated routes opened at 390 px. Each had a visible heading and fit the viewport |
| Admin browser suite | All 29 scenarios passed in one run after isolating the usage test account from the feedback rate-limit fixture. Checks covered keyboard containment, consent and pending counts after acknowledgement |
| Dependency audit | Production dependencies had zero reported findings. The dev-inclusive audit reported seven moderate and two high entries. A development toolchain upgrade remains open |

| Product areas | Browser and local verification |
|---|---|
| Sign-in, onboarding, sync, files, recovery, settings | Account browser scenarios exercised isolation, cross-device changes, uploads, deletion and cloud recovery |
| Home, Capture, Journal, Goals, Roadmap, Habits, Revision | Route smoke and Phase 01/02 regressions covered connected weekly planning, contextual guidance, focus return and bedtime confirmation |
| Life and sleep | Account browser scenarios covered logging and edits. Unit and database suites covered duration calculations, sync provenance and signed sleep actions |
| Subjects, Coach, Performance Review, Library, Current Affairs, Mistakes, Mocks, Knowledge Graph, Diary, Heatmaps | Authenticated route smoke checked rendering and mobile width. Additional end-to-end write scenarios were not added for these unchanged routes |
| Notifications, announcements, Reviews, Feedback, Demo, Admin Center | Unit rule checks, database and browser role checks, and focused opt-in review and resource scenarios |
| PWA | Worker syntax and production build checked. Installed-worker upgrade, offline behavior and push delivery require physical-device staging |

### Performance samples

| Measurement | Local sample |
|---|---|
| First throttled mobile navigation to visible content | Home 409 ms, Journal 438 ms, Roadmap 523 ms, Life 624 ms. Revision 1,195 ms and Settings 1,278 ms were the slowest measured |
| Repeat throttled mobile navigation to visible content | Home 437 ms, Journal 342 ms, Roadmap 186 ms, Life 439 ms |
| Capture button to visible dialog across three opens | 444 ms, 243 ms and 234 ms on local Chromium. The fixture differs from the Phase 02 timing sample |
| Life computation, typical / heavy | 1.91 / 1.90 ms for the 90-day report with associations and 5.65 / 5.19 ms for the sleep timeline. The Phase 03 local medians were 2.59 / 4.01 ms and 5.85 / 11.30 ms, respectively |
| Snapshot size and notification evaluation, typical / heavy | 152 / 1,810 KB serialized, with evaluation and inbox derivation in 1.98 / 8.20 ms. Delivery-provider latency is outside this measurement |
| Admin usage query | 38 ms median from five local PGlite runs with 1,000 synthetic accounts, 1,000 attachment metadata rows and 35,000 telemetry rows. The 35-day query returned 50 accounts |

Browser samples reflect the local runner and mock backend. Installed-client
measurements, production entry-save latency and deployed query cost remain
staging checks. The historic run used another environment and cannot isolate
the effect of this release on navigation.

### Visual verification

Local browser screenshots cover the scheduled review invitation, Admin Center
attention, and desktop and mobile Resource Usage views. The screenshots are
retained with the local test evidence.

- [Admin attention on Overview](phase-04-evidence/web-release-attention.webp)
- [Resource Usage on desktop](phase-04-evidence/web-release-resource-usage.webp)
- [Resource Usage on mobile](phase-04-evidence/web-release-resource-mobile.webp)
