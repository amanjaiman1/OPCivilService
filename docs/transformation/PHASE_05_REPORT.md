# Phase 05 · DoOrDie native application

Phase 05 adds a real React Native application that shares the existing account,
cloud snapshot, store actions and sync engine. The web app and Admin Center stay
at the repository root. The work starts from the Phase 04 PR commit, which
GitHub confirmed was merged. No production deployment, shared-database migration, signed binary or store submission has been performed.

## Implementation milestones

| Milestone | Current state |
|---|---|
| A · Architecture | Expo Router project, separate dependency graph, root web deployment preserved. Native and web use one shared store and versioned sync adapter |
| B · Account and data | SecureStore, SQLCipher, scoped transport, owner and version guards, draft retention and encrypted local recovery and opt-in backup export. Shared offline/reconnect and cross-account cases pass |
| C · Native experience | Home, Plan, Life and More tabs, native Capture modal, account appearance, native inputs, accessibility labels and a guided quick tour |
| D · Core features | Shared Journal, Roadmap, Goals, Subjects, Revision, Habits, Life and Sleep workflows implemented to the scope recorded in the parity matrix |
| E · Advanced features | Basic native records and analytics, reviews, support, attachments, account deletion, account-bound Expo push, authenticated direct bedtime recording and morning check-in |
| F · Hardening | Local JavaScript exports, Android prebuild, web build and browser regression. Real-device verification and full feature parity remain open |
| G · Distribution | Build profiles, setup, PWA transition and release gates documented. Native binary, beta and store steps pending an authorized environment |

## Architecture and data

The former browser-bound store now wraps a reusable vanilla Zustand factory.
The native SQLite snapshot and its stamp move together. The sync engine still
owns optimistic version checks, conflicts, held saves and recovery. Additive migrations create private native recipient, receipt and bedtime action tables. They preserve
the Web Push tables, existing account data and web write schema. Production rollout
must apply the migrations and enable the provider as separate staged steps.

The design uses semantic lavender, light and dark appearance, native
navigation and a prominent global Capture action. Study, Roadmap, Life and
revision use the same existing domain calculations. The app uses system
document selection and sharing with explicit consent. Office files above the
existing limit do not upload. No private snapshot content is sent with crash
reports or lock-screen push payloads.

## Local verification

- 345 unit tests including native callback, account isolation,
  offline restart and merge, revision habit completion, capture immutability,
  notification routing and payload contracts, and same-account backup merge.
- Eleven database suites. All 21 migrations applied twice against local PGlite.
- Web TypeScript, lint, source class scanner and Next.js production build.
- 23 web account scenarios, 29 Admin Center scenarios and separate Phase 01–03 regressions with mock Supabase. The Capture confirmation fixture now picks a stable evening and handles the existing daily sleep gate.
- Native lint, TypeScript and Android/iOS Hermes exports. Each uncompressed JS bundle
  is about 4.3 MB. Android project generation was successful.
- Android binary generation stopped at missing SDK and ADB. iOS archive,
  installation, real-device screenshots and native performance measurements
  were unavailable in this Linux environment.
- Local throttled web navigation probe reported first-content samples of
  351 ms for Home, 390 ms for Journal, 494 ms for Roadmap and 401 ms for Life. The Capture browser fixture measured 414 ms for its first open and 176 and 140 ms on repeats.
  The browser and runner differed from the historical Phase 04 sample.
- Dependency scan reported no high or critical mobile entries and three
  moderate build-time dependency advisories in the Expo fingerprint chain.

## Remaining release blockers

Complete the outstanding advanced parity items, verified auth links and
app-not-installed fallback. Run the full offline, version-conflict, private
file, feedback, review and account deletion journeys with real staging accounts.
Verify native permissions, push delivery, receipts, accessibility, startup,
memory and background behavior on Android and iOS. Native bedtime actions are authenticated and scoped to one installation and night, with cold-start handling. Validate execution in foreground, background and terminated states on supported operating-system versions. No native release or PWA
promotion change is ready from the present evidence.

[Architecture](../mobile/ARCHITECTURE.md) · [Development](../mobile/DEVELOPMENT.md) ·
[Authentication](../mobile/AUTHENTICATION.md) · [Offline and sync](../mobile/OFFLINE_AND_SYNC.md) ·
[Notifications](../mobile/NOTIFICATIONS.md) · [Feature parity](../mobile/FEATURE_PARITY.md) ·
[Security](../mobile/SECURITY.md) · [Release guide](../mobile/RELEASE_GUIDE.md) ·
[PWA transition](../mobile/PWA_TRANSITION.md)
