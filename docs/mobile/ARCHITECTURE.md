# DoOrDie mobile architecture

Next.js and Vercel continue to run from the repository root. The Expo project
lives in `apps/mobile`, with its own dependency lockfile for React 19, React
Native and Expo. Web remains on React 18. Metro loads shared TypeScript from
`src/lib` and resolves dependencies from the mobile project, so the native
bundle uses one React runtime. The backend additions cover native push registration, receipts and one-use bedtime actions.

| Boundary | Implementation |
|---|---|
| Shared state mutations | `src/lib/chronicle-store.ts` exports a Zustand vanilla factory. Web injects account-scoped browser storage and appearance callbacks. Native injects account-scoped SQLite |
| Shared data and rules | `src/lib/types.ts`, normalization, Daily Capture, topic and revision scheduling, habit derivation, Roadmap, Goals, Sleep and Life, performance, mock, coach, graph and notification rules |
| Shared synchronization | `src/lib/sync/engine.ts`, the snapshot adapter, merge and integrity checks, Supabase transport and existing versioned RPCs |
| Portable platform contracts | Review, announcement and feedback RPCs; server ownership of private attachment objects; account deletion API |
| Web-specific services | IndexedDB, device storage keys, browser live subscriptions, DOM appearance, marketing and Admin Center, Web Push and service worker |
| Native adapters | SecureStore, SQLCipher SQLite, Expo Router, lifecycle/connectivity, native clipboard-free file sharing, system theme and notifications |
| Native backend extensions | Owner-bound Expo token registration and receipts, one-use bedtime actions and an optional sender in the shared dispatcher |

The web account switch and sync coordinator retain their existing APIs.
Native creates one store and one engine for a verified active account.
It checks account identity at the adapter and at token retrieval, in addition
to Supabase authorization. An engine stops when its account changes. On
foreground and reconnect the active engine reconciles against the cloud's
latest version. Domain updates such as completing an objective or advancing a
revision are the same actions that web calls.

The shell uses Home, Plan, Capture, Life and More. Capture is a native modal.
Weekly objectives and milestones appear in Goals as Study through the shared
projection. The UI uses native text, buttons, modals and system inputs with
semantic color, adaptive type and explicit status announcements. Layout needs
review on real devices.

See the [feature parity inventory](FEATURE_PARITY.md) and
[implementation report](../transformation/PHASE_05_REPORT.md).
