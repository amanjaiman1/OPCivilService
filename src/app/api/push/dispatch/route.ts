import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import webpush, { WebPushError } from "web-push";
import { adminClient } from "@/lib/supabase-admin";
import {
  decideForUser,
  groupByUser,
  isGoneForever,
  payloadForPlatform,
  type SubscriptionRow,
  type Snapshot,
} from "@/lib/push-dispatch";
import type { DeliveryLog } from "@/lib/notifications";
import { deliverNative, reconcileNativeReceipts, type NativeRecipient } from "@/lib/native-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Send the notifications that are due, to every subscribed device.
 *
 * Called on a schedule — see docs/notifications.md for the cron options. Every
 * decision is made by the same pure engine the browser uses, so a pushed
 * notification and the bell can never disagree; this route is the I/O around it.
 *
 * Run it often. The engine's own rate limits (one per subject per day, the
 * per-day cap, the minimum gap, quiet hours, the digest hour) are what decide
 * whether anything is actually sent, so calling every 15 minutes does not mean
 * notifying every 15 minutes — it means the hour-gated rules fire close to their
 * hour instead of up to an hour late.
 */

interface Row extends SubscriptionRow {
  user_id: string;
}

function configuredVapid(): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { subject, publicKey, privateKey };
}

export async function POST(request: Request) {
  return dispatch(request);
}

/**
 * GET as well as POST: most schedulers (Vercel Cron among them) only ever issue
 * a GET. The bearer secret is what protects it, not the verb.
 */
export async function GET(request: Request) {
  return dispatch(request);
}

async function dispatch(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set; dispatch is disabled." },
      { status: 503 },
    );
  }
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  const vapid = configuredVapid();
  const nativeToken = process.env.EXPO_PUSH_ACCESS_TOKEN;
  if (!vapid && !nativeToken) {
    return NextResponse.json({ error: "Push providers are not configured." }, { status: 503 });
  }
  if (vapid) webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const admin = adminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase service role is not configured." },
      { status: 503 },
    );
  }

  const at = new Date();
  const cutoff = new Date(at.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const [, webRows, nativeRows] = await Promise.all([
    admin.rpc("platform_sample_footprint"),
    vapid ? admin.from("chronicle_push_subscriptions")
      .select("id, user_id, endpoint, key_p256dh, key_auth, platform, timezone") : null,
    nativeToken ? admin.from("chronicle_native_push").select("device_id, user_id, token, platform, timezone")
      .gt("updated_at", cutoff) : null,
  ]);
  if (webRows?.error) {
    return NextResponse.json({ error: "Web recipients are unavailable." }, { status: 500 });
  }
  // A rollout may configure Expo before applying the native registry migration.
  // Keep Web Push available and expose this diagnostic without recipient data.
  const nativeUnavailable = Boolean(nativeRows?.error);
  const webByUser = groupByUser<Row>((webRows?.data ?? []) as Row[]);
  const nativeByUser = groupByUser<NativeRecipient>((nativeRows?.data ?? []) as NativeRecipient[]);
  const candidates = [...new Set([...webByUser.keys(), ...nativeByUser.keys()])];
  if (nativeToken && !nativeUnavailable) {
    await reconcileNativeReceipts(admin, nativeToken, at);
    await admin.from("chronicle_native_push").delete().lt("updated_at", cutoff);
    await admin.from("chronicle_native_bedtime_actions").delete().lt("expires_at", at.toISOString());
  }
  if (!candidates.length) {
    return NextResponse.json({ ok: !nativeUnavailable, users: 0, sent: 0, skipped: [], nativeUnavailable });
  }
  const allowed = await admin.rpc("platform_push_eligible_users", { p_users: candidates });
  if (allowed.error || !Array.isArray(allowed.data)) {
    return NextResponse.json({ ok: false, error: "Account eligibility unavailable." }, { status: 503 });
  }
  const userIds = allowed.data as string[];
  if (!userIds.length) return NextResponse.json({ ok: true, users: 0, sent: 0, skipped: [] });

  /**
   * Both lookups are batched. One query per user would turn a few hundred
   * subscribers into a few hundred round trips and blow any serverless time
   * limit long before it finished.
   */
  /**
   * The snapshots come trimmed — no journal prose, no photos, no long notes —
   * from `chronicle_dispatch_snapshots`, which is most of the egress this route
   * used to cost. An unavailable privacy projection pauses dispatch.
   */
  const [trimmed, { data: logs, error: logError }] = await Promise.all([
    admin.rpc("chronicle_dispatch_snapshots", { p_user_ids: userIds }),
    admin.from("chronicle_push_log").select("user_id, log").in("user_id", userIds),
  ]);
  if (trimmed.error || logError) {
    return NextResponse.json({ ok: false, error: "Notification data unavailable." }, { status: 503 });
  }
  const states = trimmed.data as { user_id: string; data: unknown }[] | null;

  const snapshots = new Map<string, Snapshot>();
  for (const row of states ?? []) {
    snapshots.set(row.user_id as string, (row.data ?? {}) as Snapshot);
  }
  const logByUser = new Map<string, Partial<DeliveryLog>>();
  for (const row of logs ?? []) {
    logByUser.set(row.user_id as string, (row.log ?? {}) as Partial<DeliveryLog>);
  }

  // Only expired credentials are removed; active ones deduplicate dispatches.
  await admin.from("chronicle_sleep_push_actions").delete().lt("expires_at", at.toISOString());
  let sent = 0;
  const skipped: { user: string; reason: string }[] = [];
  /**
   * The response is printed in the scheduler's log, which is public for a public
   * repository, so accounts are only ever identified by a short prefix.
   */
  const short = (id: string) => `${id.slice(0, 8)}…`;
  const deadEndpoints: string[] = [];
  const logUpserts: { user_id: string; log: DeliveryLog; updated_at: string }[] = [];

  for (const userId of userIds) {
    const devices = webByUser.get(userId) ?? [];
    const native = nativeByUser.get(userId) ?? [];
    const decision = decideForUser(
      snapshots.get(userId),
      [...devices, ...native],
      logByUser.get(userId),
      at,
    );
    if (!decision.send) {
      skipped.push({ user: short(userId), reason: decision.reason });
      continue;
    }

    const priority = decision.notices[0]?.priority;
    let deliveredToAny = false;

    for (const device of devices) {
      const payload = payloadForPlatform(
        { ...decision.payload, account: userId },
        device.platform,
        priority,
      );
      let tokenHash: string | undefined;
      if (decision.bedtime) {
        const token = randomBytes(32).toString("hex");
        tokenHash = createHash("sha256").update(token).digest("hex");
        const issued = await admin.from("chronicle_sleep_push_actions")
          .upsert({
            token_hash: tokenHash,
            subscription_id: device.id,
            user_id: userId,
            night: decision.bedtime.night,
            timezone: decision.bedtime.timezone,
            expires_at: new Date(at.getTime() + 7 * 3600_000).toISOString(),
          }, { onConflict: "subscription_id,night", ignoreDuplicates: true })
          .select("token_hash");
        // Skip an already issued delivery. If the action store is unavailable,
        // avoid sending a payload we cannot deduplicate or record safely.
        if (issued.error || !issued.data?.length) continue;
        payload.bedtimeToken = token;
        payload.bedtimeEndpointHash = createHash("sha256").update(device.endpoint).digest("hex");
        payload.actions = [{ action: "sleep-now", title: "Sleeping now" }, { action: "later", title: "Later" }];
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: device.endpoint,
            keys: { p256dh: device.key_p256dh, auth: device.key_auth },
          },
          JSON.stringify(payload),
          {
            // Hold it at the push service for a while if the device is offline;
            // a revision reminder is still worth having an hour later.
            TTL: 3600,
            urgency: priority === "critical" ? "high" : "normal",
          },
        );
        deliveredToAny = true;
        sent++;
      } catch (e) {
        if (tokenHash) await admin.from("chronicle_sleep_push_actions").delete().eq("token_hash", tokenHash);
        const status = e instanceof WebPushError ? e.statusCode : undefined;
        if (isGoneForever(status)) {
          // The push service says this endpoint no longer exists. Anything else
          // is transient and the row is kept — one bad afternoon should not
          // quietly unsubscribe everybody.
          deadEndpoints.push(device.endpoint);
        }
      }
    }

    if (nativeToken && native.length) {
      const accepted = await deliverNative(admin, nativeToken, native, decision.payload, decision.bedtime, at);
      sent += accepted;
      deliveredToAny ||= accepted > 0;
    }

    /**
     * The log only advances if something actually arrived. Recording a send that
     * failed everywhere would burn the day's cap and the per-subject cooldown on
     * a notification nobody ever saw.
     */
    if (deliveredToAny) {
      logUpserts.push({
        user_id: userId,
        log: decision.nextLog,
        updated_at: at.toISOString(),
      });
    } else {
      skipped.push({ user: short(userId), reason: "Every device failed." });
    }
  }

  await Promise.all([
    logUpserts.length
      ? admin.from("chronicle_push_log").upsert(logUpserts, { onConflict: "user_id" })
      : Promise.resolve(),
    deadEndpoints.length
      ? admin
          .from("chronicle_push_subscriptions")
          .delete()
          .in("endpoint", deadEndpoints)
      : Promise.resolve(),
  ]);

  return NextResponse.json({
    ok: true,
    users: userIds.length,
    nativeUnavailable,
    sent,
    pruned: deadEndpoints.length,
    skipped,
  });
}
