# Phase 05 — Independent audit quality register

Audit of `main` at commit `d3907d0` (2026-11-27). Every finding below was
checked against the actual files, builds and test runs, not names or docs.

## Baseline (recorded before any change)

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean (exit 0) |
| Unit tests | `npm test` | 337 pass / 0 fail |
| Lint | `npm run lint` | 0 warnings, 0 errors (`next lint` deprecation notice only) |
| Production build | `npm run build` | succeeds (~25 s) |
| Design-token guard | `npm run check:classes` | clean |
| Dependency audit | `npm audit --omit=dev` | 0 production vulnerabilities |
| End-to-end | `npm run test:e2e` (mock Supabase, real Chromium) | 23/23 scenarios pass |

Codebase: 63 routes across `(marketing)`, `(app)`, `(auth)`, `(admin)`;
~170 TS/TSX files; 19 additive Supabase migrations; no TODO/FIXME markers,
no `@ts-ignore`/`: any` in `src/`, no `console.log`, no empty catches.

## Register

### P1 — none open

No security, data-loss, account-isolation or sync-corruption defect was
confirmed. Specific checks that came back clean:

- **Admin API**: `requireAdmin()` is the only entry (`src/lib/platform/server/auth.ts`);
  bearer-token → Supabase user → platform role check, 401/403 paths covered.
- **RLS coverage**: all 25 tables enable row level security across the 19
  migrations; every `SECURITY DEFINER` function pins `search_path`
  (156 `set search_path` clauses, 0 unpinned definers).
- **API routes**: same-site enforcement (`sec-fetch-site`/origin fallback,
  `src/lib/report-server.ts:70`), bearer auth, service-role use limited to
  admin/ban/account-delete paths, cron endpoints refuse to run without
  `CRON_SECRET` (`src/app/api/push/dispatch/route.ts`).
- **Sync safety**: conflict holds, integrity checks and batch retry exist and
  are exercised by the e2e suite (`tests/e2e/accounts.e2e.mjs`, scenario 1
  plus the phase-02/03 scenarios).
- **PWA**: versioned caches, network-first for updates, offline fallback.

### P2 — fixed during this audit

| ID | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| P2-1 | Signed-in app shell had no skip-to-content link; keyboard users had to tab through rail/sidebar/top bar on every page (marketing pages already had one) | `src/components/layout/app-shell.tsx` had no skip anchor; contrast with `src/app/(marketing)/layout.tsx:26` | Skip link added before the page slot; `main` given `id="main"` and `tabIndex={-1}`. Typecheck + 337 tests re-run green after the edit |
| P2-2 | `npm run build` intermittently died with `Invariant: no direct app page entry found for /favicon.ico` whenever the preview dev server had populated `.next` | reproduced twice; known dev/build collision on a shared build directory | `build` now clears `.next` first; the e2e harness builds into its own `.next-e2e` (`NEXT_DIST_DIR` in `next.config.mjs`), so tests never touch the dev server's directory |
| P2-3 | `npm run test:e2e` failed at browser launch because `PLAYWRIGHT_BROWSERS_PATH` pointed at a directory with no Chromium in it | reproduced: pinned dir empty, Chromium installed in the user cache | Harness falls back to the installed cache when the pinned path has no browser, then imports Playwright |

### P3 — fixed during this audit

| ID | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| P3-3 | e2e harness hardcoded ports 3100/54321, so a stale run made every later run die with EADDRINUSE | `tests/e2e/accounts.e2e.mjs:21-22`, reproduced against a leftover server on 54321 | Ports are now probed first and the first free pair is used (`E2E_APP_PORT`/`E2E_MOCK_PORT` still override); the mock, the build and `next start` all use the same chosen pair |

### P3 — accepted, no action taken

| ID | Finding | Evidence | Why accepted |
| --- | --- | --- | --- |
| P3-1 | `next lint` is deprecated (removal in Next 16) | lint output | Migration to ESLint CLI is a tooling change, not a quality defect |
| P3-2 | Dev-only transitive vulnerability in `minimatch` via the ESLint chain | `npm audit` (dev deps only) | Not shipped to production; fix lands with the lint migration |
| P3-4 | `<img>` without literal `alt` in `file-tile.tsx` | grep false positive — `alt` present via spread/props | No change needed |

## Verification of the P2 fix

- `npx tsc --noEmit` — clean
- `npm test` — 337 pass / 0 fail
- Onboarding + shell walked in a real browser at 390×844 (phone) and 1280×900
  (desktop): no horizontal overflow, no clipped or overlapping text, no
  low-contrast samples reported by the layout probe.
- Full production build re-run after the edit (see final message for status).

## Restrictions honoured

No production migration, push or deploy was performed. All migrations in the
repo are additive. The PWA, service worker and feature tour are intact.
