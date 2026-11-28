-- v20: an account now remembers where it is in each interactive walkthrough,
-- in the synced snapshot at data->'walkthroughs'. The JSON is owned by the
-- client's pure rules (src/lib/walkthroughs/progress.ts), so the server only
-- keeps the shape sane. Nothing is invented for an account that never opened
-- a walkthrough: its first visit is what starts one.

-- A slice written as anything other than an object (null, an array, a string
-- from a hand-edited backup) would crash the first-visit reader. Reset it to
-- an empty map, which means "nothing seen yet".
update public.chronicle_state
set data = jsonb_set(data, '{walkthroughs}', '{}'::jsonb, true)
where jsonb_typeof(data -> 'walkthroughs') is not null
  and jsonb_typeof(data -> 'walkthroughs') <> 'object';

-- Only snapshots that already carry the new slice take the new write floor.
-- Accounts still on v19 keep their current floor until their client writes it,
-- exactly as the v19 sleep promote did.
update public.chronicle_state
set schema_version = 20
where schema_version < 20
  and jsonb_typeof(data -> 'walkthroughs') = 'object';
