import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The service worker manages its own caches and nothing else: no install,
 * activation or update may touch where the account's data lives. (Critical
 * test I: an update, a cache clear or an uninstall can't reset an account.)
 */
const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8")
  // Comments may mention storage; only code counts.
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("the service worker never touches localStorage, sessionStorage or IndexedDB", () => {
  for (const api of ["localStorage", "sessionStorage", "indexedDB", "deleteDatabase", "storage.clear"]) {
    assert.ok(!sw.includes(api), `public/sw.js uses ${api}`);
  }
});

test("activation deletes only this app's own older caches", () => {
  const deletes = sw.match(/caches\.delete\(/g) ?? [];
  assert.equal(deletes.length, 1, "one place deletes caches");
  assert.match(sw, /\.filter\(\(n\) => n\.startsWith\("chronicle-"\) && !KNOWN_CACHES\.includes\(n\)\)\s*\.map\(\(n\) => caches\.delete\(n\)\)/);
});

test("the service worker never sends anything to the database", () => {
  assert.ok(!/rest\/v1|supabase/i.test(sw), "public/sw.js talks to Supabase");
});
