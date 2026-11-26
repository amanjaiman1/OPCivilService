# Offline storage and sync

SQLCipher stores the native account snapshot, its version stamp, the last
agreed merge base, up to 30 date-scoped Study Capture drafts, one preserved
recovery snapshot, one set of conflicts and bounded configuration metadata.
The database key is kept in SecureStore. SQLite WAL and full synchronous
writes provide durable committing. The snapshot and its stamp share one row.
If a crash leaves the stamp and merge base apart, the shared engine uses its
conservative merge path. Device-local drafts do not become synced journal days
until the user saves.

Initial hydration needs an authorized cloud copy or an established stamped
cache. A storage error stops writes until the account can reopen. The shared
engine pulls a cheap head, downloads only when required, compares versions on
save, merges independent edits and asks for decisions in destructive-replace or
missing-cloud cases. Native lets the user retain cloud records and merge local
additions when a save is held. A prior local copy can be explicitly exported
from Settings. Native can merge a supported backup from the same account while retaining current values. A conflict-by-conflict recovery editor remains open for parity.

Synced local forms include study, canonical topic completion, revision, weekly
targets, goal progress, habit check-ins, Life readings, diary and basic
preparation records. Network services include account creation, review and
feedback, direct cloud file transfer, and push registration. The foreground
and reconnect handlers retry pending sync. After OS process eviction, a saved
local record is picked up on the next usable app session. Continuously
running background synchronization is outside this lifecycle.

Physical testing must kill the app after a local save, reconnect, verify exactly
one record on web, then exercise concurrent edits, held changes, account
switching and a stale cloud schema. The unit and database tests do not exercise
OS encryption or process eviction.
