import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushPayload } from "./push-dispatch";

export interface NativeRecipient {
  device_id: string;
  user_id: string;
  token: string;
  platform: "android" | "ios";
  timezone: string;
}

type Ticket = { status?: "ok" | "error"; id?: string; details?: { error?: string } };
type ReceiptRow = { id: string; device_id: string; token: string };

const expoBase = "https://exp.host/--/api/v2/push";

async function expoRequest<Output>(operation: "send" | "getReceipts", token: string, body: unknown): Promise<Output | null> {
  try {
    const response = await fetch(`${expoBase}/${operation}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const json = await response.json() as { data?: Output };
    return json.data ?? null;
  } catch { return null; }
}

type BedtimeWindow = { night: string; timezone: string };
type BedtimeAction = { night: string; token: string };

export function expoMessage(recipient: NativeRecipient, payload: PushPayload, bedtime: boolean, action?: BedtimeAction) {
  return {
    to: recipient.token,
    title: "DoOrDie",
    // Lock-screen payloads deliberately contain no study topics, notes,
    // scores, diary entries, names or account identifiers.
    body: bedtime ? "Your evening check-in is ready." : "You have a preparation reminder.",
    data: {
      device: recipient.device_id, route: bedtime ? "/wellbeing" : payload.href.split("?")[0], bedtime,
      ...(action ? { night: action.night, action: action.token } : {}),
    },
    ttl: 3600,
    channelId: "doordie-reminders",
    ...(bedtime ? { categoryId: "doordie-bedtime" } : {}),
  };
}

async function removeRecipient(client: SupabaseClient, row: Pick<ReceiptRow, "device_id" | "token">) {
  await client.from("chronicle_native_push").delete().eq("device_id", row.device_id).eq("token", row.token);
}

export async function deliverNative(
  client: SupabaseClient, token: string, devices: NativeRecipient[], payload: PushPayload,
  bedtime: BedtimeWindow | undefined, now: Date,
): Promise<number> {
  let actions: Map<string, BedtimeAction> | undefined;
  if (bedtime) {
    const issued = await client.from("chronicle_native_bedtime_actions").upsert(
      devices.map(({ device_id }) => ({ device_id, ...bedtime, token: randomUUID(), expires_at: new Date(now.getTime() + 7 * 3600_000).toISOString() })),
      { onConflict: "device_id,night", ignoreDuplicates: true },
    ).select("device_id, night, token");
    if (issued.error) return 0;
    actions = new Map((issued.data ?? []).map((row) => [row.device_id, { night: row.night, token: row.token }]));
    devices = devices.filter((device) => actions?.has(device.device_id));
  }
  if (!devices.length) return 0;
  const tickets = await expoRequest<Ticket[]>("send", token, devices.map((device) =>
    expoMessage(device, payload, Boolean(bedtime), actions?.get(device.device_id))
  ));
  // If the network answer is ambiguous, do not release the night's action:
  // Expo may have accepted the message before the response was lost.
  if (!Array.isArray(tickets) || tickets.length !== devices.length) return 0;
  const receipts: ReceiptRow[] = [];
  await Promise.all(tickets.map(async (ticket, i) => {
    const { device_id, token: recipient } = devices[i];
    const action = actions?.get(device_id);
    if (action && ticket?.status === "error") await client.from("chronicle_native_bedtime_actions").delete().eq("token", action.token);
    if (ticket?.status === "ok" && typeof ticket.id === "string" && ticket.id.length <= 120) receipts.push({ id: ticket.id, device_id, token: recipient });
    if (ticket?.details?.error === "DeviceNotRegistered") await removeRecipient(client, { device_id, token: recipient });
  }));
  if (receipts.length) await client.from("chronicle_native_push_receipts").upsert(receipts, { ignoreDuplicates: true });
  return receipts.length;
}

export async function reconcileNativeReceipts(client: SupabaseClient, token: string, now: Date) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const ready = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const { data } = await client.from("chronicle_native_push_receipts").select("id, device_id, token")
    .gt("created_at", since).lt("created_at", ready).order("created_at").limit(300);
  const rows = (data ?? []) as ReceiptRow[];
  if (rows.length) {
    const results = await expoRequest<Record<string, Ticket>>("getReceipts", token, { ids: rows.map((row) => row.id) });
    if (results) {
      const resolved = rows.filter((row) => results[row.id]);
      await Promise.all(resolved.filter((row) => results[row.id].details?.error === "DeviceNotRegistered").map((row) => removeRecipient(client, row)));
      if (resolved.length) await client.from("chronicle_native_push_receipts").delete().in("id", resolved.map((row) => row.id));
    }
  }
  await client.from("chronicle_native_push_receipts").delete().lt("created_at", since);
}
