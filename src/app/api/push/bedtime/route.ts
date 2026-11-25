import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { sameSite } from "@/lib/report-server";
import { adminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

let minute = 0;
let attempts = 0;
const byClient = new Map<string, number>();

function rateAllowed(request: Request) {
  const window = Math.floor(Date.now() / 60_000);
  if (window !== minute) {
    minute = window;
    attempts = 0;
    byClient.clear();
  }
  if (attempts++ >= 240) return false;
  const client = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const count = (byClient.get(client) ?? 0) + 1;
  byClient.set(client, count);
  return count <= 12;
}

export async function POST(request: Request) {
  // Require same-origin fetches and an exact, fixed-length capability.
  if (!sameSite(request)) {
    return NextResponse.json({ status: "unavailable" }, { status: 403 });
  }
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return NextResponse.json({ status: "unavailable" }, { status: 403 });

  if (!rateAllowed(request)) return NextResponse.json({ status: "unavailable" }, {
    status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" },
  });

  const admin = adminClient();
  if (!admin) return NextResponse.json({ status: "unavailable" }, { status: 503 });
  const { data, error } = await admin.rpc("chronicle_record_push_bedtime", {
    p_token_hash: createHash("sha256").update(token).digest("hex"),
  });
  const ok = data === "recorded" || data === "already_recorded";
  return NextResponse.json({ status: error || !ok ? "unavailable" : data }, {
    status: error ? 503 : ok ? 200 : 403,
    headers: { "Cache-Control": "no-store" },
  });
}
