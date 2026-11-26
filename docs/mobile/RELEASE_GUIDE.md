# Mobile release guide

Development, preview and production profiles are in `apps/mobile/eas.json`.
The development and preview identifiers are internal. Supply the approved
production Android package and iOS bundle identifier through
`DOORDIE_ANDROID_PACKAGE` and `DOORDIE_IOS_BUNDLE_ID`. No store identifiers
were reserved. Icons and splash styling reuse DoOrDie's application assets.

1. Approve staging distribution, native credentials and identifier ownership.
2. Apply Phase 04 migrations before the native registry and bedtime action migrations.
   Verify RLS, the current web migration floor and the native runtime
   SQLCipher capability. Leave native push disabled until both providers are ready.
3. Verify registration and recovery email links, installation/sign-in for a
   previous web user, offline termination and conflict recovery, files, reviews,
   account deletion, permissions, push and PWA coexistence.
4. Build and install both development variants. Verify release binaries on
   target devices and VoiceOver/TalkBack, large text, orientation policy, normal
   foreground/background transitions and small screens. Capture store screenshots
   from those builds and measure startup, memory, battery, charts and storage.
5. Prepare Google Play Data safety and Apple App Privacy disclosures with current
   behavior, a public support and privacy URL, deletion instructions, listing
   metadata, signing and beta distribution. Confirm the Android external
   account deletion resource and the in-app pathway on both platforms.
6. Begin uploads or paid remote builds only after explicit authorization.
   Record artifact certification, beta results and separate store approval.

This runner generated an Android project and both JS bundles. Android
installation was blocked by missing Android SDK/ADB. iOS archive generation
requires a macOS/Xcode environment and signing access. Neither platform binary,
store screenshot set nor store submission exists from this run.

- [Build locally](https://docs.expo.dev/build-reference/local-builds/)
- [Apple account deletion guidance](https://developer.apple.com/go/?id=ar-ad-support)
- [Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)

## Draft store material

**Display name** DoOrDie

**Short description** Plan UPSC preparation, log study, revise on schedule,
and reflect on progress across your devices.

**Listing description** Manage preparation in one account. Plan your year,
month and week, record study in Daily Capture, and use completed topics to
build a revision queue. Review goals, habits and wellbeing alongside your
study history. Save supported entries offline and synchronize when connected.
Optional reminders and private feedback are available in the app.

**Initial release notes** Native Daily Capture, account syncing with the web
app, weekly planning and Goals, Revision, Life and sleep, plus optional device
reminders. Confirm the list against the actual release binary before submission.

For the listing, capture Home, Daily Capture, Plan, Revision and Life on both
platforms using test data. Review disclosures for account contact information,
study and wellbeing data, private files, written feedback, device push tokens
and synchronization metadata. Validate privacy labels and age rating against
what the release binary and provider configuration actually collect. Obtain
the approved public support, privacy and deletion links from the product owner.
