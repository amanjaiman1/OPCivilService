import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const endpoint = "https://push.example.test/subscription";
const href = "/wellbeing?sleep=reminder#sleep-card-title";

async function clickSleep({ action = "sleep-now", activeEndpoint = endpoint, result = "recorded" } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const windows: string[] = [];
  const listeners = new Map<string, (event: unknown) => void>();
  const self = {
    location: { origin: "https://app.example.test" },
    addEventListener: (key: string, fn: (event: unknown) => void) => listeners.set(key, fn),
    registration: { pushManager: { getSubscription: async () => ({ endpoint: activeEndpoint }) } },
    clients: {
      matchAll: async () => [],
      openWindow: async (url: string) => { windows.push(url); },
    },
  };
  runInNewContext(worker, {
    self, URL, TextEncoder, AbortSignal, crypto: webcrypto,
    fetch: async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (result === "offline") throw new Error("Offline");
      return { ok: result !== "unavailable", json: async () => ({ status: result }) };
    },
  });
  let pending: Promise<unknown> | undefined;
  listeners.get("notificationclick")!({
    action,
    waitUntil: (task: Promise<unknown>) => { pending = task; },
    notification: {
      close: () => undefined,
      data: { href, bedtimeToken: "a".repeat(64), bedtimeEndpointHash: createHash("sha256").update(endpoint).digest("hex") },
    },
  });
  await pending;
  return { calls, windows };
}

test("Sleeping now uses its scoped request and keeps the app closed on success or replay", async () => {
  for (const result of ["recorded", "already_recorded"]) {
    const { calls, windows } = await clickSleep({ result });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/push/bedtime");
    assert.equal(calls[0].init.credentials, "omit");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(windows, []);
  }
});

test("failed sleep actions and stale subscriptions open manual confirmation, while Later only dismisses", async () => {
  for (const result of ["offline", "unavailable"]) {
    assert.deepEqual((await clickSleep({ result })).windows, [`https://app.example.test${href}`]);
  }
  const switched = await clickSleep({ activeEndpoint: "https://push.example.test/replacement" });
  assert.deepEqual(switched.calls, []);
  assert.deepEqual(switched.windows, [`https://app.example.test${href}`]);
  assert.deepEqual(await clickSleep({ action: "later" }), { calls: [], windows: [] });
});
