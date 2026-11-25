# Phase 03 · Sleep and Life Dashboard

## Audit and scope

The local branch starts from the verified Phase 02 implementation at `11aa507`.
The earlier transformation reports, sleep and Life workflows, notification dispatcher,
service worker, account snapshot migrations, and existing unit and database contracts
were checked. The baseline passed 329 unit tests.

The previous editor labelled all time in bed as sleep, hid actual duration below
a disclosure and presented a second wake-up action in the morning check-in. The
existing Life reports already covered tracked metrics, equivalent periods,
period charts, daily detail and minimum-sample associations. The work preserves
those reports and adds a separate sleep timeline and logging calendar.

## Data and interaction

The wake-up date identifies a night. An evening bedtime belongs to the next
wake-up date, and a 01:00 bedtime belongs to that date itself. The app stores
new sleep clock edits with an IANA zone when possible. It resolves elapsed
duration across clock changes in that zone, chooses the first occurrence of a
repeated wall time, and asks for a valid time if the clock skipped the reading.
Legacy records keep their dates and stored hours and use the existing device-zone
interpretation when no recorded zone is available. A later change in profile
zone does not reinterpret timestamps on zoned records.

Morning check-in labels both clock fields with calendar context, shows a
wake-up suggestion on opening a fresh morning form and writes only on Save.
Actual time asleep may be entered directly or via 15, 30 and 60 minute awake
shortcuts. These preserve the clock times. Without an explicit correction, the duration can be estimated from time in
bed. New entries keep the duration source even when a report equals the interval. The rail's confirmation
from Phase 02 still applies and uses the shared date helper.

Today’s summary, Sleep, linked goals, period reports and metric details use
a shared visual system. Unrecorded values remain empty and a valid zero
contributes to recorded-day coverage. The overnight timeline uses a 6 PM–6 PM
axis for clock times, with exact timestamps and elapsed durations in text.
The target band only appears when the schedule can be drawn on that axis.
Tap a represented date to open its Life record. See [Life Dashboard](../life-dashboard.md)
for report and sample-size methodology.

## Delivery and authorization

Bedtime preferences and delivery limits use the existing notification engine.
The scheduler considers a reminder between 21:00 and midnight, using its
first available eligible run. Digest mode keeps its ordinary daily digest.
An eligible bedtime reminder is separate and respects quiet hours and the
regular cap and minimum gap. A bedtime or completed night suppresses a push.
The scheduler does not guarantee exact 21:00 delivery.

The action contains a cryptographically generated, single-purpose capability.
The database stores its hash and binds it to one subscription, account and
night. The worker checks the active subscription; the RPC checks live
subscription ownership and preference settings. The credential is consumed
with the snapshot mutation under row locks. Expiry is at most seven hours
and additionally stops at 04:00 for that night. Account and date are never
accepted from the caller. The server records its receipt time using the
issued zone. Replay cannot write twice. An existing bedtime or wake-up is
preserved. The endpoint limits requests per instance, and the database
limits credentials to one per subscription and night.

The database keeps a checkpoint, lets existing triggers increment the snapshot
version, and updates an existing Journal day without creating one. Local
unrelated fields reconcile via the existing three-way sync. No notification
contains a sleep reading. No offline mutation is queued. The fallback opens the
sleep card so the user can check existing data and record manually.

| Surface | Behavior | Verification |
|---|---|---|
| Worker with one or more action buttons | Sleeping now requests a background save. Later is offered if two buttons fit | Simulated worker click and local SQL checks |
| Browser with no action buttons | A notification body click opens the sleep card | Fallback URL covered in local browser; real delivery unverified |
| Failed save, switched subscription, or offline browser | Manual confirmation path, with no success claim or queued write | Worker tests and local SQL checks |
| Android, installed iOS PWA, macOS, Windows, Linux | Action presentation depends on browser and OS support | Live push and system notification clicks were not tested on physical devices |

Physical-device push validation and a concurrent two-connection PostgreSQL
load test remain release gates for background logging. The local SQL test
exercises sequential replay and a second subscription against the same
record. The HTTP per-instance throttle is best effort across serverless
instances; the row-lock and credential limits apply in the database.

## Native handover

Reuse the normal sleep-domain contracts and wake-up date convention. Native
delivery can use a native device binding and the same single-action principle.
Keep receipt time, credential expiry, manual save semantics and sync versioning
explicit. A native integration should not require access to the browser worker
or the web push subscription. This change introduces no native client.

## Local evidence and checks

See [morning check-in](phase-03-evidence/morning-check-in.png),
[desktop Life Dashboard](phase-03-evidence/life-desktop.png),
[mobile Life Dashboard](phase-03-evidence/life-mobile.png),
[mobile sleep rhythm](phase-03-evidence/rhythm-mobile.png) and
[sleep detail](phase-03-evidence/sleep-details.png).


The 90-day compute probe ran 15 iterations per synthetic account on Node 24.
The table shows elapsed medians on one local core. It measures analytics
computation, with no network, browser rendering, or time-to-interactive claims.

| Probe | Typical account · 152 KB | Large account · 1,810 KB |
|---|---:|---:|
| Period report and paired associations | 2.59 ms | 4.01 ms |
| Zoned sleep timeline preparation | 5.85 ms | 11.30 ms |

Full browser performance probes and live push transport were outside this
local run. Applying the migration, deploying the service worker, and sending
real notifications require the normal release process. No production migration
or test push was sent.

| Local check | Result |
|---|---|
| Unit tests | 335 passed, including time-zone conversion, notification eligibility, worker fallback and comparison coverage |
| Database tests | All eight suites passed. All 15 migrations applied twice. Sleep checks covered scoped permissions, replay, expiry, revoked subscriptions, preservation of unrelated readings and a rejected stale version |
| Lint, TypeScript and class scanner | Passed |
| Production build | Passed in an isolated checkout, including the bedtime API |
| Account and admin Playwright regressions | 23 account and 28 admin scenarios passed on a production build against mock Supabase |
| Phase 01 and Phase 02 Playwright workflows | Passed on the production build against mock Supabase. |
| Phase 03 Playwright workflow | Passed in Chromium. Covered the fallback page, 23:30 bedtime, an unsaved 07:00 suggestion, 30 minutes awake, mobile timeline and absent sleep target |

The broader account and admin runs preceded the final adjustments to sleep
target display and travel handling. Those changes were checked separately with
unit tests, type checks and a production build. The reports are diagnostic
artifacts from locally created fixture accounts.
