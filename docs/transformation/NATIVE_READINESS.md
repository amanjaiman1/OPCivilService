# Native readiness

The native app can reuse the business rules and data contracts without shipping
the browser shell. Keep core logic pure until a native host actually needs an
adapter. The existing web application remains the reference implementation.

| Contract | Current shared code | Native adapter |
|---|---|---|
| Account data and validation | `src/lib/types.ts`, `src/lib/account/normalize.ts`, `src/lib/life-entry.ts`, `src/lib/platform/validate.ts` | Validate on device and server. Keep account-scoped storage and preserve unknown data |
| Study entry and revision | `src/lib/daily-capture.ts`, `src/lib/topics.ts`, `src/lib/revision.ts` | Build native forms around the existing date and topic rules |
| Planning, goals and habits | `src/lib/roadmap.ts`, `src/lib/weekly-goal-items.ts`, `src/lib/goals.ts`, `src/lib/habit-engine.ts` | Preserve source records and their existing projections |
| Sleep and Life | `src/lib/sleep.ts`, `src/lib/zoned-time.ts`, `src/lib/life.ts`, `src/lib/metric-series.ts` | Supply IANA zone and local dates. Keep estimated and reported sleep separate |
| Sync | `src/lib/sync/engine.ts`, `merge.ts`, `supabase-transport.ts` | Use secure token storage and isolated durable data. Keep versioned writes, the merge base, holds and device status |
| Engagement | `src/lib/notifications.ts`, `src/lib/push-dispatch.ts` | Apply native permission, foreground and delivery adapters. Do not run Web Push or browser persistence on native |
| Review invitations | `platform_claim_review_invitation` and existing review routes | Use a random lease ID per foreground attempt and the same overlay coordination and consent wizard |
| Files | `src/lib/files.ts`, `src/lib/file-storage.ts` | Use native file URIs, temporary authorized URLs and uploads into the same private account namespace |
| UI and reporting | `docs/design-system.md`, semantic token names in `src/app/globals.css` | Translate tokens into native themes. Test accessibility, text scaling and touch interactions in native components |

Use a keychain or platform credential store for refresh tokens. Record connectivity
and lifecycle through native APIs, and stop queued work on account switch. Browser
`localStorage`, `sessionStorage`, `document`, `window`, service workers, DOM
file pickers and Cache Storage are adapters rather than domain dependencies.
Deep links should use the same route intent and validate the target before opening
an editor. Use the same account-isolated upload and error-reporting permissions and
avoid including content in telemetry.

A native push registration endpoint and scoped native action binding are future
backend additions. Reuse the night/date, token expiry, one-action scope and
snapshot conflict behavior of the web service. Keep APNs and FCM credentials on
the server. Do not reuse web push subscription keys as a native device identity.
