# Mobile security

SecureStore protects authentication and the 256-bit database key. Credentials
are chunked within native key-value limits. A committed manifest identifies the
current generation and changes after all new parts are saved. iOS uses
device-only accessibility when unlocked. Android application backups are
disabled. A custom compiled build must report a SQLCipher runtime before the
app opens or writes private offline records.

The app opens only the verified account's rows. Transport validates the current
identity before requesting a write and supplies a token restricted to that
session. RLS, server ownership, schema/version checks and the signed web bedtime
action remain in place. Native file paths use the account ID and byte hash.
Journal attachment picking has explicit upload confirmation. Sharing a file or
backup intentionally creates a temporary cache copy and cleans it when the
share flow finishes. The recipient app, OS cache, or process eviction can leave
a copy after sharing begins, so the user chooses a trusted destination.

Nothing sends journal prose, diary text, or raw snapshots to a crash reporter.
Feedback shares only the message the user enters. Push provider payloads
carry generic content and opaque device routing. Retain the staged audit on
auth callbacks, link interception, secret scanning, staging account switching,
contact permissions, attachment ownership, backup policy and receipt handling.
The local SDK audit found three moderate advisories in the Expo fingerprint
tooling dependency chain and zero high or critical entries. Review the
compatible upstream fix before release.

- [SecureStore limits and storage](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/)
- [Expo SQLite](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/)
