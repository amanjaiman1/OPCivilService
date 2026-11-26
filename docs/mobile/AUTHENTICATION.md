# Authentication

Sign-in, registration, session refresh and password recovery use the same
Supabase Auth project as the web. The native SDK persists authentication using
SecureStore and sends the public client key with authenticated requests.
Sign-in requires a connection the first time. Native uses PKCE with a local
verifier and S256 for registration and recovery links. Only the configured
scheme, host, path and a single code pass the callback parser. Password recovery
waits on the SDK's recovery event before opening the account's data.

The development, preview and production schemes are `doordie-dev`,
`doordie-preview` and `doordie`. The callback is `<scheme>://auth/callback`.
Allow-list exact staging callbacks and verify the Supabase email templates
honor the request's redirect. The existing web token-hash route stays in place.
Verified Universal/App Links and an app-not-installed fallback require site
association files and staging verification. Cross-device opening of a native
PKCE link requires asking for a fresh link on the device that will use it.

The account ID comes from the session. The data client obtains a bearer token
only for its own live account. A Super Admin is referred to the secured web
Admin Center. When an account signs out, the app attempts to finish sync and
revokes this installation's push registration. If sync is unavailable, the
user can explicitly retain the encrypted offline copy and sign out when
registration and session revocation can finish. Another account cannot open
the copy. A cold start with an expired session may need a connection to
restore authentication. Local records stay encrypted while the app reconnects.

Account deletion reauthenticates in a temporary client, verifies that this
is the active account, requires typed confirmation, then calls the existing
web deletion endpoint. Upon confirmed deletion the app clears its local
account records and session. Verify the entire path with a staging account,
including attachment deletion and the last Super Admin guard.
