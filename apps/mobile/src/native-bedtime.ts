import { authClient, scopedClient } from "./cloud";

type BedtimeIntent = { device: string; action: string; night: string };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function bedtimeIntent(data: Record<string, unknown> | null | undefined): BedtimeIntent | null {
  if (!data || data.bedtime !== true || data.route !== "/wellbeing" || typeof data.device !== "string" ||
      typeof data.action !== "string" || typeof data.night !== "string" || !uuid.test(data.device) ||
      !uuid.test(data.action) || !/^\d{4}-\d{2}-\d{2}$/.test(data.night)) return null;
  return { device: data.device, action: data.action, night: data.night };
}

export async function recordNativeBedtime(intent: BedtimeIntent, activeAccount?: string) {
  // Capture a single, authenticated bearer token for this request. The RPC
  // independently checks that the account owns the installation and action.
  const { data } = await authClient?.auth.getSession() ?? {};
  const session = data?.session;
  if (!session || (activeAccount && session.user.id !== activeAccount)) return "unavailable";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const result = await scopedClient(async () => session.access_token)
      .rpc("chronicle_record_native_bedtime", { p_device: intent.device, p_token: intent.action })
      .abortSignal(controller.signal);
    if (result.error) return "retry";
    return result.data === "recorded" || result.data === "already_recorded" ? result.data : "unavailable";
  } finally { clearTimeout(timeout); }
}
