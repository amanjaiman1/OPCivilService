# Accounts, isolation and sync

Every account is an independent chronicle. This note explains how that is
enforced, layer by layer, and how one account's data moves between its devices.

## What belongs to whom

| Kind | Examples | Where it lives |
| --- | --- | --- |
| **Private, per account** | Profile and exam date, journal, study hours, syllabus progress, revision schedule, mocks, mistakes, goals, Roadmap plans, books' progress, current affairs, performance reviews, Personal Diary entries, habits (with their corrections), the Study Coach history, life log, knowledge-graph links, accomplished days, notification preferences and read state, appearance | The account's snapshot: one `chronicle_state` row, mirrored in the browser under the account's own keys |
| **Per account, per device** | Notification delivery bookkeeping, the last-synced copy used for merging | Browser only, under keys or IndexedDB slots that carry the account id |
| **Device-wide, not personal** | Sidebar collapsed, PWA install prompt dismissed | Browser only |
| **Shared reference** | The GS syllabus and its topics, the standard book list, habit suggestions, the curated links between syllabus topics | Code (`lib/seed.ts`). Each account gets its own copy at setup, so progress on it is private |

A new account starts from the shared reference only: an empty journal, no mocks,
goals or mistakes, an empty Roadmap, a syllabus with nothing studied, and a
profile filled in by its owner during first-run setup
(`components/account/onboarding.tsx`). The fixed CSE 2027 plan older versions
showed has been retired; see [`docs/roadmap.md`](./roadmap.md).

## The database (the security boundary)

- `chronicle_state` has Row Level Security on, with select/insert/update/delete
  policies of `auth.uid() = user_id`. Since the multi-user migration, browser roles
  can no longer write the table directly at all. The write paths are functions
  that act on `auth.uid()`'s own row and never on an id the caller supplies:
  `chronicle_save`, `chronicle_init`, `chronicle_confirm_replace` and
  `chronicle_restore` (see [Sync safety](#sync-safety)), plus the previous app
  version's `save_chronicle_state`, guarded the same way. A save with no `plans`
  or `coach` key (from a device on an older version) keeps the ones stored.
- A trigger stamps every write server-side: `version` goes up by one,
  `updated_at` is the database clock, and `user_id` can never change.
- `chronicle_push_subscriptions` and `chronicle_push_log` keep their per-user RLS
  policies; the log has no write policy for browsers at all.
- `chronicle_dispatch_snapshots` (the dispatcher's reader) can be executed by the
  service role only.
- Deleting a user cascades to all three tables.
- The service-role key is read only in `lib/supabase-admin.ts`, which runs in API
  routes (push and account deletion) and never in the browser bundle.

`supabase/tests/rls_isolation.sql` proves these rules inside Postgres, and is run
by `npm run test:db` on every change.

## The browser

`lib/account/scope.ts` scopes every key to the active account:

```
upsc-chronicle-store:<account id>          the persisted Zustand store, with its sync stamp
upsc-chronicle-theme|transparency:<id>     appearance, read by the pre-paint script
upsc-chronicle-ready:<id>                  this browser has completed a sync
upsc-chronicle-conflicts:<id>              edits that clashed between devices
upsc-chronicle-safety:<id>                 up to two safety copies (see Sync safety)
upsc-chronicle-platform-role:<id>          the Admin Center role, to route a Super Admin there
IndexedDB upsc-chronicle-sync / <id>       the last-synced copy, for merging
upsc-chronicle-device                      a random device label for the sync trail (not per account)
```

With no active account, every read returns nothing and every write is dropped.
`lib/account/session.ts` loads and unloads an account in a fixed order:

- **Activate:** point storage at the account, reset the store in memory with
  writes still off, turn writes on, then read the account's saved state.
- **Deactivate:** turn writes off and detach storage first, then reset the store
  and the look.

`components/account/account-session.tsx` is mounted once per account, keyed by
its id, so a different account remounts every page, form and cache. Nothing
renders, and nothing can be edited, until it is settled which copy is the
account's (the hydration gate, below).

**Signing out** pushes anything pending, unsubscribes this device from
background push, stops sync, unloads the account, and — once everything is
confirmed in the cloud — removes the account's keys and IndexedDB entries from
the browser. If changes couldn't be synced (offline), the student is asked; the
changes then stay in the browser, under that account's keys only, and sync at the
next sign-in there. Only this device's session ends (`scope: "local"`).

**Deleting an account** (Settings → Delete account) requires typing DELETE and
re-entering the password, which gives the server a fresh token.
`/api/account/delete` takes the user from that token, refuses tokens older than
ten minutes, and deletes the auth user; the database cascade removes everything
else. The browser's copy is wiped too.

## Sync

`lib/sync/engine.ts` keeps an account's local snapshot and its cloud row in step:

1. **Check, don't download.** On start, on return to the app, when the connection
   comes back, every three minutes while visible, and the moment another device
   saves (a live update), it asks only for the row's `version`. Full data is fetched only when that version differs from the one
   this device last synced.
2. **Save on top of a known version.** Edits are debounced (2 s, at most 10 s) and
   saved with `chronicle_save(data, version, schema, device)`. If another device
   saved in between, the save is refused.
3. **Merge, then save.** On a refusal it fetches the newer copy and merges three
   ways (`lib/sync/merge.ts`): the version both devices started from, this
   device's copy, and the cloud's. Journal days and the life log are matched by
   date, every other list by `id` (Roadmap plans, and the activities inside
   each plan, included), and objects field by field, so edits to different
   things are all kept and a deletion only wins over an unchanged item.
   When the same field was changed on both devices, this device's value is kept
   and the other is recorded in Settings → Data, where it can be downloaded.
4. **Retry.** Network failures back off (2 s to 60 s); the status shows
   "Offline" and changes stay saved on the device.

Only one tab per account talks to the cloud. Tabs elect a leader with the Web
Locks API; the others save locally, the leader picks those saves up through
`storage` events, and its status is shared over a `BroadcastChannel`
(`lib/sync/coordinator.ts`).

### Data from before accounts

Older versions stored everything under one unscoped key. On the first sign-in
after the upgrade, `lib/account/legacy.ts` moves it into the account that last
synced it from that browser (the old app recorded that account in
`upsc-chronicle-cloud-synced:<id>`). The first sync then decides whose copy is
newer: if the cloud hasn't changed since that browser last synced, the local copy
is saved; otherwise both are merged, keeping everything from each side. The old
key is removed only after that sync succeeds. Data with no such marker is never
given to anyone.

## Free-plan footprint

See the README's *Free-plan budget*. In short: snapshots are text only (a year of
logging is about 360 KB), reads are version checks, writes return a version, and
the dispatcher reads a trimmed copy.

## Sync safety

### The incident this answers

In November 2026 a student's month of history was replaced in the cloud by an
empty template (one journal day, one life day, one revision, and the three
suggested habits a new account starts with), after installing the PWA, removing
the browser's site data, and signing in elsewhere.

The code path that did it, reproduced against the previous engine
(`tests/sync-engine.test.ts`, "INCIDENT"): the browser keeps the account's data
in `localStorage` and its last-synced copy in IndexedDB, and nothing tied the
two together. When `localStorage` was cleared and IndexedDB was not, the engine
found a blank store next to a valid synced copy, read the difference as "the
student deleted everything", and saved the blank **with a valid base version**,
which the server accepted. The app then showed first-run setup in the default
theme. A new browser afterwards only downloaded what was already there.

What the database can still tell (the row's `version` and the template's dates)
is in *Investigating an account* below; whether that student's browser took
exactly this path can't be proven without it.

### The rules

**Which copy is the account's.** The persisted store carries a *stamp*: the
account and cloud version its data descends from, in the same `localStorage`
entry as the data, so the two are written and cleared together. The last-synced
copy is used to infer edits (and deletions) only when its version matches the
stamp. A blank copy without a stamp is nothing: the cloud's copy is taken as it
is. Unreadable copies, and copies carrying another account's stamp, are set
aside as safety copies before anything can write over them.

**The hydration gate** (`AccountSession`):

| Situation | What happens |
| --- | --- |
| Stamped copy of this account | Opens at once; offline editing allowed, marked "Saved on this device, not yet in the cloud" |
| Device from before stamps, storage intact (ready flag, readable store) | Opens at once; stamped from its synced copy on first sync |
| Fresh, wiped or unreadable copy | Waits for the cloud; nothing editable |
| Cloud unreachable on such a copy | "We couldn't verify your cloud data. Your account has not been reset." Try again / Sign out |
| Cloud says recovery | Recovery screen; nothing written until the student chooses |
| Cloud written by a newer app | "Update needed" (blocking on a fresh device, a banner otherwise) |

A failed or timed-out request is never taken for an empty account: only a
successful read with no row leads to `chronicle_init`, and the server decides.

**What the server decides** (`supabase/migrations/20261216120000_sync_safety.sql`):

- `chronicle_init` creates a first snapshot at most once per account
  (`chronicle_accounts` remembers). It refuses when the account had a snapshot
  and the row is gone (`missing`), or when an account older than seven days
  offers only an empty template (`unrecognised`). The recovery screen then
  offers recovery copies, uploading this device's copy if it holds data, or an
  explicit empty start.
- `chronicle_save` is a compare-and-swap on `version` under a row lock. It never
  inserts. It refuses a save from a schema lower than the one that last wrote
  the account (`outdated`), and **holds** a save that would remove a large share
  of the account: half or more of a history of ten or more records, two lists
  of three or more emptied at once, a list of ten or more halved, or setup
  undone (`chronicle_destructive_summary`; the client's twin is
  `lib/sync/integrity.ts`). The app then asks: **Bring my data back** (the
  cloud's data returns, merged with this device's additions) or **I deleted
  them on purpose**, which `chronicle_confirm_replace` applies only for that
  hold's id and the identical payload, on the same version, within 30 minutes,
  after keeping a copy.
- `chronicle_restore` puts a recovery copy back (Settings → Data, or the
  recovery screen), naming the version it replaces and keeping it first.

**Offline changes.** The pending changes are the difference between the stamped
local copy and the last-synced copy, both persisted, so they survive restarts
and app updates, stay under the account's own keys, and are never discarded
until a save is confirmed. Reconnecting merges three ways as before; a retry
can't duplicate anything because saves are whole, versioned states merged by
key. A separate operation queue would duplicate this, so there isn't one.

**Changes arriving from elsewhere.** Before a merge from the cloud removes a
large share of what a device holds, the device keeps a safety copy of its own
data (Settings → Data, downloadable). This is what would keep the last surviving
copy of a month if the cloud had already been damaged.

**Multiple tabs.** One tab syncs (Web Locks). If another tab saves a copy written
before it heard of the latest sync, its older stamp gives it away: the two are
merged item by item and nothing is inferred as deleted.

**Updates.** The service worker only manages its own caches; it never touches
`localStorage` or IndexedDB. Accepting "A new version is ready" gives pending
changes up to 2.5 s to reach the cloud, then reloads; they are kept on the
device regardless.

### Recovery copies and their cost

`chronicle_state_history` keeps, per account, the newest five daily copies (the
data as it was before the first save of each day) and the newest five copies
taken before a confirmed replacement or restore. Identical copies aren't stored
twice. A new account's data is about 24 KB and a year's about 360 KB, and
Postgres compresses it, so ten copies cost roughly 0.1 to 1 MB per account: a
few hundred heavily used accounts fit easily in the Free plan's 500 MB.
`chronicle_retention()` holds the numbers. The copies are readable only by their
owner and writable only by these functions; deleting the account removes them.

### Diagnostics

`chronicle_sync_events` keeps the newest 100 events per account: the server's
own (first snapshot created or refused, save held, replacement confirmed,
restore, outdated client, save with no row) and the device's (a first download
failed, a store that didn't match its synced copy, a copy set aside, conflicts
recorded, outdated app, data brought back from a hold), each with a version, a
device label and counts. Never any text. Settings → Data → Technical details
shows them, with the cloud version, the device that last saved, and the schema.

### Investigating an account

In the SQL Editor (service role). `version` says how many saves the row has had.
A small number with an empty-looking snapshot means the history never reached the
cloud; a large one means it was replaced. The template's own dates say when the
empty account was created:

```sql
select s.version, s.updated_at, octet_length(s.data::text) as bytes,
       s.data #>> '{profile,onboardedAt}'  as onboarded_at,
       s.data #>> '{profile,startDate}'    as start_date,
       (select string_agg(h ->> 'createdOn', ', ') from jsonb_array_elements(s.data -> 'habits') h) as habits_created,
       public.chronicle_counts(s.data) as counts
  from public.chronicle_state s
 where s.user_id::text like 'bc39d0d4%';

-- After this migration: the account's trail and recovery copies.
select created_at, event, version, device, detail from public.chronicle_sync_events
 where user_id::text like 'bc39d0d4%' order by id desc limit 50;
select id, created_at, version, reason, counts from public.chronicle_state_history
 where user_id::text like 'bc39d0d4%' order by id desc;
```

### Deploying

1. Run `supabase/migrations/20261216120000_sync_safety.sql` in the SQL Editor,
   then `supabase/tests/sync_safety.sql` (expect `All sync safety checks passed`;
   it rolls back).
2. Deploy the app. Devices on the previous version keep saving through
   `save_chronicle_state`, now guarded the same way; once a new version has
   saved an account, older ones are asked to reload before saving.

Deploying the app before the migration is safe but degraded: saves report
"Cloud sync needs a database update", stamped devices keep working on the
device, and fresh browsers wait on the can't-verify screen.
