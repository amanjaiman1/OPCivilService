# Web release checklist

## Approvals and sequencing

1. Review the [implementation report](PHASE_04_REPORT.md). Approve production
   migrations and deployment separately. Confirm a recent database backup,
   attachment recovery access and an agreed rollback owner.
2. Apply the existing Phase 03 migration first, then apply the Phase 04
   migrations in timestamp order from `20261219120000` to `20261222120000`.
   Inspect current snapshot version distribution before the compatibility
   migration. It raises the schema floor only for snapshots with Phase 03 sleep
   metadata. A stale client receives the current upgrade prompt via the sync
   protocol. It must refresh before it can write.
3. Verify staging with a clean account, an existing account on a cached app
   build, two independent browser sessions, and each administrative role.
   Inspect an initialized study snapshot, storage metadata, batch and receipt
   rows, and the absence of private records in the Admin API.
4. Deploy the web build after successful staging verification. The PWA worker
   retains the existing update handshake and network-first document behavior.
   Verify an installed browser on the previous worker updates and reopen it
   before testing any changed notification behavior.
5. Check the scheduled dispatcher, including authenticated requests, no
   notification delivery to suspended users, the trimmed snapshot RPC,
   and the daily UTC footprint sample. Mark production ready only after the
   staged physical-device and concurrency checks are complete.

## Configuration

- Browser: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` for Web Push.
- Server only: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `VAPID_PRIVATE_KEY`,
  and `VAPID_SUBJECT`. Keep the corresponding dispatcher credentials in the
  existing scheduler. No provider management credential is needed.
- Review invitation policy uses existing Platform settings. Start with
  invitations disabled if rollout needs a staged approval, then choose a local
  time, eligibility minimums, frequency and postponement interval.

## Smoke and recovery

- Verify login, offline restore, a study entry in Capture, one full sync and an
  attachment. Check Home, Roadmap, Life, Goals, and Performance Review on a
  phone and a laptop.
- Check review timing with two independent sessions, verify consent defaults,
  and confirm a moderator with no feedback access sees neither a badge nor
  metadata for it. Check that acknowledging a summary leaves task counts intact.
- Confirm usage data stays partial and labelled, including missing file-size
  metadata, uninstrumented days and a deleted account.
- Watch sync holds and outdated clients, invitation and usage RPC errors,
  scheduler failures and database query time during rollout. Check Supabase
  Usage for actual provider consumption.
- Use the existing feature setting to turn off review invitations and pause
  dispatch in the scheduler if necessary. Prefer a forward fix for database and
  worker issues. Keep additive metadata tables and backups. If reverting the
  web build, use a build that can still read/write snapshot schema 19, or hold
  older clients in the upgrade-required state until a compatible build is
  available. Do not lower the schema guard or delete user records as rollback.
