import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  advanceWalkthrough,
  finishWalkthrough,
  openWalkthrough,
  replayWalkthrough,
  resumeStep,
  sanitizeWalkthroughProgress,
  shouldAutoOpen,
  walkthroughLength,
  walkthroughState,
  type WalkthroughProgressMap,
} from "../src/lib/walkthroughs/progress";
import { WALKTHROUGH_CATALOG, walkthroughForPath, walkthroughMeta } from "../src/lib/walkthroughs/catalog";
import type { WalkthroughExperience } from "../src/lib/walkthroughs/types";

const now = "2026-11-28T09:00:00.000Z";
const later = "2026-11-28T09:05:00.000Z";
const identity = { id: "journal", version: 2, stepCount: 6 };

/* ── the rules ────────────────────────────────────────────────── */

test("a walkthrough is new, then in progress, then complete at its version", () => {
  let map: WalkthroughProgressMap = {};
  assert.equal(walkthroughState(map.journal, identity), "new");

  map = openWalkthrough(map, identity, now);
  assert.equal(walkthroughState(map.journal, identity), "in-progress");
  assert.equal(map.journal.step, 0);
  assert.equal(map.journal.opens, 1);

  map = advanceWalkthrough(map, identity, 4, later);
  assert.equal(map.journal.step, 4);

  map = finishWalkthrough(map, identity, later);
  assert.equal(walkthroughState(map.journal, identity), "complete");
  assert.equal(map.journal.step, 5);
  assert.equal(map.journal.completedAt, later);
});

test("only a first visit or changed steps open it by itself", () => {
  const empty: WalkthroughProgressMap = {};
  assert.equal(shouldAutoOpen(empty, identity, { ready: true, blocked: false }), true);
  assert.equal(shouldAutoOpen(empty, identity, { ready: false, blocked: false }), false);
  assert.equal(shouldAutoOpen(empty, identity, { ready: true, blocked: true }), false);

  const opened = openWalkthrough(empty, identity, now);
  // Closing, or choosing "learn later", is respected on every later visit.
  assert.equal(shouldAutoOpen(opened, identity, { ready: true, blocked: false }), false);

  const done = finishWalkthrough(opened, identity, now);
  assert.equal(shouldAutoOpen(done, identity, { ready: true, blocked: false }), false);
  // The steps changed materially: offered again.
  const newer = { ...identity, version: identity.version + 1 };
  assert.equal(shouldAutoOpen(done, newer, { ready: true, blocked: false }), true);
  assert.equal(walkthroughState(done.journal, newer), "outdated");
});

test("a closed walkthrough resumes where it stopped; an outdated one starts over", () => {
  const opened = openWalkthrough({}, identity, now);
  const partWay = advanceWalkthrough(opened, identity, 3, later);
  assert.equal(resumeStep(partWay.journal, identity), 3);

  const newer = { ...identity, version: 3 };
  assert.equal(resumeStep(partWay.journal, newer), 0);
});

test("steps are clamped to the walkthrough that exists now", () => {
  const opened = openWalkthrough({}, identity, now);
  const past = advanceWalkthrough(opened, identity, 99, later);
  assert.equal(past.journal.step, 5);
  const short = { ...identity, stepCount: 3 };
  assert.equal(resumeStep(past.journal, short), 2);
});

test("replay forgets the finish but keeps the history", () => {
  const done = finishWalkthrough(openWalkthrough({}, identity, now), identity, later);
  const again = replayWalkthrough(done, identity, later);
  assert.equal(again.journal.completedAt, undefined);
  assert.equal(again.journal.step, 0);
  assert.equal(again.journal.opens, 2);
  assert.equal(again.journal.startedAt, now);
});

test("a stored map is repaired, not trusted", () => {
  const clean = sanitizeWalkthroughProgress(
    {
      journal: { version: 2, step: 99, startedAt: now, opens: 3 },
      unknown: { version: 1, step: 0, startedAt: now, opens: 1 },
      broken: { version: 1, step: 1 },
      nonsense: "yes",
    },
    [identity],
  );
  assert.deepEqual(Object.keys(clean), ["journal"]);
  assert.equal(clean.journal.step, 5);
  assert.equal(clean.journal.opens, 3);
  assert.deepEqual(sanitizeWalkthroughProgress(null), {});
  assert.deepEqual(sanitizeWalkthroughProgress([1, 2]), {});
});

test("length is written the way a person says it", () => {
  assert.equal(walkthroughLength(30), "Under a minute");
  assert.equal(walkthroughLength(70), "About a minute");
  assert.equal(walkthroughLength(150), "About 3 minutes");
});

/* ── the catalog ──────────────────────────────────────────────── */

test("the catalog routes to the page each walkthrough explains", () => {
  assert.equal(walkthroughForPath("/journal")?.id, "journal");
  assert.equal(walkthroughForPath("/journal/history")?.id, "journal");
  assert.equal(walkthroughForPath("/goals")?.id, "goals");
  assert.equal(walkthroughForPath("/journalx"), undefined);
  for (const entry of WALKTHROUGH_CATALOG) {
    assert.ok(entry.steps > 0, entry.id);
    assert.ok(entry.seconds > 0, entry.id);
    assert.equal(walkthroughMeta(entry.id)?.title, entry.title);
  }
});

test("each authored experience matches its catalog entry, step for step", async () => {
  for (const entry of WALKTHROUGH_CATALOG) {
    const module = await import(`../src/components/walkthrough/experiences/${entry.id}.tsx`);
    const experience = module.default as WalkthroughExperience;
    assert.equal(experience.id, entry.id);
    assert.equal(experience.version, entry.version);
    assert.equal(experience.path, entry.path);
    assert.equal(experience.steps.length, entry.steps, `${entry.id} step count`);
    assert.equal(new Set(experience.steps.map((s) => s.id)).size, experience.steps.length, `${entry.id} step ids are unique`);
    for (const step of experience.steps) {
      assert.ok(step.title && step.body, `${entry.id}/${step.id}`);
    }
  }
});

test("no experience can write to the account: they never import the store", () => {
  const dir = join(process.cwd(), "src/components/walkthrough/experiences");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".tsx"))) {
    const source = readFileSync(join(dir, file), "utf8");
    assert.equal(/from ["']@\/lib\/store["']/.test(source), false, file);
    assert.equal(/useChronicle/.test(source), false, file);
  }
});
