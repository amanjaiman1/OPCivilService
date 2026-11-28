# Interactive walkthroughs

One authored explanation per entry surface: the real page is lit, a hand-written
scene plays beside it, and the account remembers where it stopped.

## What exists

| Surface | Route | Steps | State |
| --- | --- | --- | --- |
| Daily Capture | popup (any page) | 8 | authored |
| Study Journal | `/journal` | 6 | authored |
| Goals | `/goals` | 6 | authored |
| Revision | `/revision` | 6 | authored |
| Habits | `/habits` | 6 | authored |
| Subjects & Syllabus | `/subjects` | 6 | authored |
| Wellbeing | `/wellbeing` | — | planned |
| Mock Tests | `/mocks` | — | planned |
| Mistakes | `/mistakes` | — | planned |
| Current Affairs | `/current-affairs` | — | planned |
| Books | `/books` | — | planned |
| Roadmap | `/roadmap` | — | planned |
| Heatmap | `/heatmap` | — | planned |
| Knowledge Graph | `/knowledge-graph` | — | planned |
| Performance Review | `/performance-review` | — | planned |
| Diary | `/diary` | — | planned |
| Announcements | `/announcements` | — | planned |
| Settings | `/settings` | — | planned |

`src/lib/walkthroughs/catalog.ts` is the register: an entry is only in
`WALKTHROUGH_CATALOG` when an experience module exists. `PLANNED_WALKTHROUGHS`
lists what is still owed, so the gap stays visible instead of being papered over
by a generic tour.

## How it is put together

- `src/lib/walkthroughs/progress.ts` — the rules, pure and total: new →
  in-progress → complete, "outdated" when an authored version moves on, resume
  points clamped to the current length, and a sanitiser for anything stored.
- `src/lib/walkthroughs/registry.ts` — lazy loaders, one bundle per experience.
  A missing or broken module resolves to `null`; the page keeps working.
- `src/components/walkthrough/walkthrough-provider.tsx` — first-visit
  controller, loading, route changes, writing progress.
- `src/components/walkthrough/walkthrough-player.tsx` — spotlight on the real
  element, floating film, caption, keyboard (arrows, Escape, Tab trap), focus
  return, reduced-motion handling, and a completion card.
- `src/components/walkthrough/demo-kit.tsx` — the scene vocabulary (fields,
  pointer, bars, rings, chips, flow links). Scenes never import the store, so a
  walkthrough cannot write a real record.
- `src/components/walkthrough/experiences/*.tsx` — the authored films. Scenes
  are keyed by step id, so reordering steps cannot attach the wrong film.

## Persistence

Progress lives in the synced snapshot at `walkthroughs`, keyed by surface:

```ts
type WalkthroughRecord = {
  version: number;      // the authored version this record was made against
  step: number;         // resume point
  startedAt: string;
  completedAt?: string;
  opens: number;
};
```

`STORE_VERSION` is 20. `supabase/migrations/20261223120000_walkthrough_progress.sql`
resets a malformed slice to `{}` and promotes only snapshots that already carry
one. A first visit opens its walkthrough once; closing it (or "learn later")
counts as having seen it, so it does not open again until the steps change.

Drafts inside Daily Capture stay in the browser's draft store and never enter
this slice.

## Authoring the next one

1. Add steps to `src/lib/walkthroughs/experiences/<id>.tsx` and a `scenes` record
   keyed by each step's `id`.
2. Add the catalog entry (id, route, title, summary, version, `steps`, seconds)
   and its loader in `registry.ts`.
3. Point steps at real elements with `target: "[data-...]"`; add that attribute
   in the page. If the element is absent, the caption centres instead.
4. Run `npm test` — the parity test holds the catalog's step count, version and
   path to the module, and fails if an experience imports the store.

## Verify

```bash
npx tsc --noEmit
npm test
npm run build
```

Browser check: open each route, confirm the player opens on a first visit,
advances with the keyboard, and that the page behind it is unchanged.
