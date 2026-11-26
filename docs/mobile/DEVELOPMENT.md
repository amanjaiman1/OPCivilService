# Mobile development

Use Node 24 with npm, or another Node version that meets Expo SDK 58's
requirements. The checked versions are Expo 58.0.26, React Native 0.88.1 and
React 19.3.0. Full build requirements are in the Expo SDK reference and build
setup guide.

- [Expo SDK reference](https://docs.expo.dev/versions/latest/)
- [Development build setup](https://docs.expo.dev/build/setup/)

From the repository root:

```sh
npm ci
npm --prefix apps/mobile ci
cp apps/mobile/.env.example apps/mobile/.env.local
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run lint
npm --prefix apps/mobile run validate
npm --prefix apps/mobile run export:android
npm --prefix apps/mobile run export:ios
npm test
npm run test:db
```

Set the public Supabase URL and publishable or legacy anon key to approved
staging values. The client only accepts HTTPS endpoints. Configure the staging
web origin for account deletion and the staging project ID for device push.
Keep privileged keys in server configuration.

SQLCipher needs a development or release build with the native plugin. Use
Android Studio with Android SDK Platform-Tools for Android, or Xcode with
the required iOS tools on macOS for iOS. Once the device or emulator is ready,
run `npm --prefix apps/mobile run android` or `npm --prefix apps/mobile run ios`.
Start Metro with `npm --prefix apps/mobile start`. Generated native projects
are ignored and can be regenerated from Expo config. An `expo export` creates
JavaScript and assets and can run without a device.

Native checks in CI type-check the project and export both bundles. Repo unit,
database and web browser checks continue to run against the root web project.
Use dedicated test accounts on staging.
