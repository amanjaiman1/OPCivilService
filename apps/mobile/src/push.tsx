import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Platform } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import * as Notifications from "expo-notifications";
import type { NativeAccount } from "./account";
import { bedtimeIntent, recordNativeBedtime } from "./native-bedtime";
import { enableBedtimeTask } from "./notification-task";
import { bedtimeNowNight } from "../../../src/lib/sleep";
import { notificationRoute } from "./push-routing";
import { Action, Copy } from "./ui";
import { useAccount, useChronicle } from "./session";

const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? Constants.easConfig?.projectId;
const channel = "doordie-reminders";
let confirmation: { accountId: string; nonce: string; expires: number } | null = null;

export function takeBedtimeConfirmation(accountId: string, nonce: unknown) {
  if (!confirmation || confirmation.accountId !== accountId || confirmation.nonce !== nonce) return false;
  const fresh = Date.now() < confirmation.expires;
  confirmation = null;
  return fresh;
}

async function configureNotifications() {
  await enableBedtimeTask().catch(() => undefined);
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(channel, { name: "Preparation reminders", importance: Notifications.AndroidImportance.DEFAULT });
  }
  await Notifications.setNotificationCategoryAsync("doordie-bedtime", [
    { identifier: "sleep-now", buttonTitle: "Sleeping now", options: { opensAppToForeground: true } },
    { identifier: "later", buttonTitle: "Later", options: { opensAppToForeground: false } },
  ]);
}

async function register(account: NativeAccount, ask: boolean, devicePushToken?: Notifications.DevicePushToken) {
  if (!projectId || (Platform.OS !== "android" && Platform.OS !== "ios")) return false;
  await configureNotifications();
  let permission = await Notifications.getPermissionsAsync();
  if (ask && !permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
  const allowed = permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!allowed) {
    if (account.push.optedIn()) await account.push.revoke();
    return false;
  }
  const token = await Notifications.getExpoPushTokenAsync({ projectId, devicePushToken });
  return account.push.register(token.data, Platform.OS, Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
}

export function DeviceNotifications({ account }: { account: NativeAccount }) {
  const router = useRouter();
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const handle = async (response: Notifications.NotificationResponse | null) => {
      if (!response || !active || !account.isActive() || !account.push.enabled()) return;
      const request = response.notification.request;
      if (request.identifier === last.current) return;
      const route = notificationRoute(request.content.data ?? {}, account.push.device, response.actionIdentifier);
      if (!route) return;
      last.current = request.identifier;
      if (response.actionIdentifier === "sleep-now") {
        const intent = bedtimeIntent(request.content.data);
        const result = intent ? await recordNativeBedtime(intent, account.id).catch(() => "retry") : "unavailable";
        if (!active || !account.isActive()) return;
        if (result === "recorded" || result === "already_recorded") {
          void account.engine.checkRemote();
          router.push("/life");
          Alert.alert(result === "recorded" ? "Bedtime recorded" : "Bedtime already recorded");
        } else if (!intent || (result === "retry" && bedtimeNowNight(new Date()) === intent.night)) {
          const nonce = randomUUID();
          confirmation = { accountId: account.id, nonce, expires: Date.now() + 60_000 };
          router.push({ pathname: "/life", params: { bedtime: nonce } });
        } else router.push("/life");
      } else router.push(route);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const accepted = active && account.isActive() && account.push.enabled() && notification.request.content.data?.device === account.push.device;
        return { shouldShowBanner: accepted, shouldShowList: accepted, shouldPlaySound: false, shouldSetBadge: false };
      },
    });
    const taps = Notifications.addNotificationResponseReceivedListener((response) => void handle(response));
    void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => undefined);
    const rotate = Notifications.addPushTokenListener((token) => {
      if (active && account.isActive() && account.push.optedIn()) void register(account, false, token).catch(() => undefined);
    });
    const resume = () => {
      if (active && account.isActive() && account.push.optedIn()) void register(account, false).catch(() => undefined);
    };
    const foreground = AppState.addEventListener("change", (state) => { if (state === "active") resume(); });
    resume();
    return () => {
      active = false;
      foreground.remove();
      taps.remove();
      rotate.remove();
      Notifications.setNotificationHandler(null);
    };
  }, [account, router]);
  return null;
}

export function PushControl() {
  const account = useAccount();
  const enabled = useChronicle((s) => s.notify.enabled);
  const [registered, setRegistered] = useState(account.push.enabled);
  const [pending, setPending] = useState(() => account.push.optedIn() && !account.push.enabled());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!projectId) return <Copy muted>Device notifications are unavailable in this build.</Copy>;
  async function toggle() {
    setBusy(true);
    try {
      const ok = registered ? await account.push.revoke() : await register(account, true);
      if (!ok) throw new Error("Push not available");
      setMessage(registered ? "Device notifications turned off." : "Device notifications turned on.");
    } catch {
      setMessage(registered ? "Could not turn off device notifications. Reconnect to try again." :
        "Could not register this device. Check notification permissions and your connection.");
    } finally { setRegistered(account.push.enabled()); setPending(account.push.optedIn() && !account.push.enabled()); setBusy(false); }
  }
  return <>
    <Action label={registered ? "Turn off device notifications" : "Enable device notifications"} disabled={busy || (!registered && !enabled)}
      selected={registered} onPress={() => void toggle()} />
    {pending && <Action label="Cancel pending registration" disabled={busy} onPress={() => {
      setBusy(true);
      void account.push.revoke().then((ok) => {
        if (ok) { setPending(false); setMessage(""); }
        else setMessage("Could not revoke this request. Try again online.");
      }).catch(() => setMessage("Could not revoke this request. Try again online.")).finally(() => setBusy(false));
    }} />}
    {message && <Copy live>{message}</Copy>}
  </>;
}
