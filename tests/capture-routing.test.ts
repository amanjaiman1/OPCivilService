import assert from "node:assert/strict";
import { test } from "node:test";
import { captureLink, withoutCaptureParams } from "../src/lib/capture-routing";
import { entryGuideForPath } from "../src/lib/entry-guides";

const today = "2026-11-26";
const link = (path: string, query: string) => captureLink(path, new URLSearchParams(query), today);

test("browsing journal entries, history and analysis does not open Capture", () => {
  assert.equal(link("/journal", ""), null);
  assert.equal(link("/journal", "tab=analysis&date=2026-11-25"), null);
  assert.equal(link("/journal/history", "new=1"), null);
  assert.equal(link("/revision", "section=life"), null);
  assert.equal(link("/journal", "section=other"), null);
});

test("journal capture links restore a section and a valid historical day", () => {
  assert.deepEqual(link("/journal", "new=1"), { date: today, section: "day" });
  assert.deepEqual(link("/journal", "date=2026-11-25&section=life"), { date: "2026-11-25", section: "life" });
  assert.deepEqual(link("/journal", "new=1&section=habit"), { date: today, section: "habit" });
  assert.deepEqual(link("/journal", "date=2026-02-30"), { date: today, section: "day" });
  assert.deepEqual(link("/journal", "date=2026-11-27"), { date: today, section: "day" });
});

test("clearing consumed capture parameters keeps journal context and anchors", () => {
  const url = new URL("https://doordie.example/journal?new=1&tab=topics&section=life&date=2026-11-25#summary");
  assert.equal(withoutCaptureParams(url), "/journal?tab=topics#summary");
});

test("entry guides cover each student entry feature and its nested routes", () => {
  for (const route of [
    "/dashboard", "/journal/history", "/journal/2026-11-25", "/subjects", "/revision", "/goals", "/roadmap",
    "/habits", "/wellbeing/sleep", "/mocks", "/current-affairs", "/books", "/mistakes", "/knowledge-graph",
    "/diary", "/performance-review", "/coach",
  ]) {
    const guide = entryGuideForPath(route);
    assert.ok(guide?.steps.every(Boolean), route);
    assert.ok(guide?.sample && guide.result, route);
  }
  assert.equal(entryGuideForPath("/announcements"), undefined);
});
