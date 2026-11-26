import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { bedtimeIntent, recordNativeBedtime } from "./native-bedtime";

const task = "doordie-native-notification-action";

if (Platform.OS === "android") {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(task, async ({ data, error }) => {
    if (!error && data && "actionIdentifier" in data && data.actionIdentifier === "sleep-now") {
      const intent = bedtimeIntent(data.notification.request.content.data);
      if (intent) await recordNativeBedtime(intent).catch(() => undefined);
    }
    return Notifications.BackgroundNotificationTaskResult.NoData;
  });
}

export async function enableBedtimeTask() {
  if (Platform.OS === "android" && await TaskManager.isAvailableAsync() && !await TaskManager.isTaskRegisteredAsync(task)) {
    await Notifications.registerTaskAsync(task);
  }
}
