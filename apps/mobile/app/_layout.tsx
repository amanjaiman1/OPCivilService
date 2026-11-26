import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useStore } from "zustand";
import { Sessions, useSession } from "../src/session";
import type { NativeAccount } from "../src/account";
import { Appearance, usePalette } from "../src/ui";
import { DeviceNotifications } from "../src/push";

function Routes() {
  const { account, recovery } = useSession();
  const p = usePalette();
  return <>
    <StatusBar style={p.canvas === "#181421" ? "light" : "dark"} />
    {account && !recovery && <DeviceNotifications account={account} />}
    <Stack screenOptions={{ headerStyle: { backgroundColor: p.canvas }, headerTintColor: p.ink, contentStyle: { backgroundColor: p.canvas } }}>
      <Stack.Screen name="(student)" options={{ headerShown: false }} />
      <Stack.Screen name="capture" options={{ title: "Daily Capture", presentation: "modal" }} />
      <Stack.Screen name="module/[name]" options={{ title: "DoOrDie" }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
    </Stack>
  </>;
}

function AccountAppearance({ account }: { account: NativeAccount }) {
  const mode = useStore(account.store, (state) => state.themeMode);
  return <Appearance mode={mode}><Routes /></Appearance>;
}

function Root() {
  const { account } = useSession();
  // Keep the navigation tree mounted through asynchronous authentication.
  return account ? <AccountAppearance account={account} /> : <Appearance><Routes /></Appearance>;
}

export default function Layout() {
  return <Sessions><Root /></Sessions>;
}
