# Native notifications

The app has a native inbox based on shared rule evaluation and synced read
state. A user can opt in to OS push when the build has an approved Expo project
ID. The account-wide device push preference must also be on. Android uses a
preparation channel. The app asks for permission only on
the opt-in action, renews its token on foreground and token rotation, and
revokes before sign-out. The database limits registrations per account, keeps
them out of direct client reads, and cascades deletion. A token can move between
accounts after the previous registration is revoked.

A configured dispatcher evaluates eligibility, quiet hours, timing, caps and
completion suppression once per account with the existing delivery log.
It fans out the reminder to the enabled Web Push and native installations.
Native lock-screen content is generic. The routing data carries a per-account
installation ID and an allow-listed route, and contains no raw records or web
sleep-action capability. The sender prunes expired registrations and checks
provider tickets and receipts. A provider acceptance ticket means the
notification was queued for delivery. If the PWA and native are separately
enabled on the same handset, each remains a subscribed endpoint.

Sleeping now records bedtime directly using a time-limited action unique to
the owning installation and night. The RPC requires its owner's authenticated
session. The same protected snapshot writer serves web and native, rejects an
expired or revoked action and keeps existing bedtime and wake time values.
The application can handle a tap after a cold start. Android also registers
a background notification action task where available. A transient failure can
open a confirmation when the reminder still matches the current night.
Later closes the reminder without recording. Device delivery and background
execution remain subject to operating system policy and must be verified on
approved Android and iOS devices.

For staging, configure the project ID and platform provider credentials with
the authorized Expo project, apply the registry and bedtime action migrations, then set
`EXPO_PUSH_ACCESS_TOKEN` in the existing dispatcher environment. Leave Web
Push credentials in place. Verify grant, deny, token rotation, account switch,
revocation, duplicate scheduler invocations, receipt pruning and warm/cold
taps on both operating systems before widening access.

- [Expo notifications SDK](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/)
- [Expo device push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [Provider tickets and receipts](https://docs.expo.dev/push-notifications/sending-notifications/)
