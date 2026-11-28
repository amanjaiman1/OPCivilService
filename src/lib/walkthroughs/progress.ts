/* ════════════════════════════════════════════════════════════════
   WALKTHROUGH PROGRESS — PURE RULES

   Where someone is in each walkthrough, and — the part most tutorials get
   wrong — when they should be shown it again. Every function here is pure
   and total, so the rules can be tested without a browser and the same
   snapshot drives every device.
   ════════════════════════════════════════════════════════════════ */

/** The identity a progress record needs: an id, its version, its length. */
export interface WalkthroughIdentity {
  id: string;
  version: number;
  stepCount: number;
}

export interface WalkthroughRecord {
  /** The authored version this record was made against. */
  version: number;
  /** Where to resume: the last step reached, clamped to the current length. */
  step: number;
  /** ISO instant of the first open. */
  startedAt: string;
  /** ISO instant of the finish; absent while unfinished. */
  completedAt?: string;
  /** How many times it has been opened, for the launcher's wording. */
  opens: number;
}

export type WalkthroughProgressMap = Record<string, WalkthroughRecord>;

/**
 * What the launcher and the first-visit controller should say:
 *  - `new`: never opened;
 *  - `in-progress`: opened, not finished (also the state after "Learn later");
 *  - `complete`: finished at this version — say nothing more;
 *  - `outdated`: finished, but the steps have changed since.
 */
export type WalkthroughState = "new" | "in-progress" | "complete" | "outdated";

export function emptyWalkthroughProgress(): WalkthroughProgressMap {
  return {};
}

function clampStep(step: number, stepCount: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(Math.trunc(step), Math.max(0, stepCount - 1)));
}

export function walkthroughState(
  record: WalkthroughRecord | undefined,
  identity: WalkthroughIdentity,
): WalkthroughState {
  if (!record) return "new";
  if (record.completedAt) return record.version >= identity.version ? "complete" : "outdated";
  return "in-progress";
}

/**
 * First visit to a surface opens its walkthrough once. It opens only when
 * never opened, or when the authored steps have moved past the version that
 * was finished — never for a walkthrough that is part-finished, so closing
 * it (or choosing "Learn later") is respected on every later visit.
 */
export function shouldAutoOpen(
  map: WalkthroughProgressMap,
  identity: WalkthroughIdentity,
  context: { ready: boolean; blocked: boolean },
): boolean {
  if (!context.ready || context.blocked) return false;
  const state = walkthroughState(map[identity.id], identity);
  return state === "new" || state === "outdated";
}

/** The step to resume at; an outdated finished walkthrough starts over. */
export function resumeStep(
  record: WalkthroughRecord | undefined,
  identity: WalkthroughIdentity,
): number {
  if (!record) return 0;
  if (record.version < identity.version) return 0;
  return clampStep(record.step, identity.stepCount);
}

/** Called when the player actually opens: remembers the version and counts it. */
export function openWalkthrough(
  map: WalkthroughProgressMap,
  identity: WalkthroughIdentity,
  now: string,
): WalkthroughProgressMap {
  const existing = map[identity.id];
  const fresh = !existing || existing.version < identity.version;
  return {
    ...map,
    [identity.id]: {
      version: identity.version,
      step: fresh ? 0 : clampStep(existing.step, identity.stepCount),
      startedAt: existing?.startedAt ?? now,
      // An outdated finish is kept only until the new version is finished.
      completedAt: fresh ? undefined : existing.completedAt,
      opens: (existing?.opens ?? 0) + 1,
    },
  };
}

/** Each step reached is written down, so a closed tab resumes in place. */
export function advanceWalkthrough(
  map: WalkthroughProgressMap,
  identity: WalkthroughIdentity,
  step: number,
  now: string,
): WalkthroughProgressMap {
  const existing = map[identity.id] ?? {
    version: identity.version,
    step: 0,
    startedAt: now,
    opens: 0,
  };
  return {
    ...map,
    [identity.id]: {
      ...existing,
      version: identity.version,
      step: clampStep(step, identity.stepCount),
    },
  };
}

export function finishWalkthrough(
  map: WalkthroughProgressMap,
  identity: WalkthroughIdentity,
  now: string,
): WalkthroughProgressMap {
  const existing = map[identity.id];
  return {
    ...map,
    [identity.id]: {
      version: identity.version,
      step: Math.max(0, identity.stepCount - 1),
      startedAt: existing?.startedAt ?? now,
      completedAt: now,
      opens: existing?.opens ?? 1,
    },
  };
}

/** "Replay" forgets the finish but keeps the fact that it was opened. */
export function replayWalkthrough(
  map: WalkthroughProgressMap,
  identity: WalkthroughIdentity,
  now: string,
): WalkthroughProgressMap {
  const existing = map[identity.id];
  return {
    ...map,
    [identity.id]: {
      version: identity.version,
      step: 0,
      startedAt: existing?.startedAt ?? now,
      completedAt: undefined,
      opens: (existing?.opens ?? 0) + 1,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whatever was stored — an older shape, a hand-edited value, a cloud snapshot
 * from a build that wrote something else — becomes a valid map. With the known
 * identities, unknown ids are dropped; a nonsense step is clamped, and a
 * record without a usable start is dropped rather than half-restored.
 */
export function sanitizeWalkthroughProgress(
  raw: unknown,
  identities?: readonly WalkthroughIdentity[],
): WalkthroughProgressMap {
  if (!isRecord(raw)) return {};
  const known = identities ? new Map(identities.map((identity) => [identity.id, identity])) : null;
  const clean: WalkthroughProgressMap = {};
  for (const [id, value] of Object.entries(raw)) {
    const identity = known ? known.get(id) : undefined;
    if (known && !identity) continue;
    if (!isRecord(value)) continue;
    const stepCount = identity?.stepCount ?? Number.MAX_SAFE_INTEGER;
    const version = typeof value.version === "number" && Number.isFinite(value.version)
      ? Math.max(1, Math.trunc(value.version))
      : (identity?.version ?? 1);
    const startedAt = typeof value.startedAt === "string" && value.startedAt ? value.startedAt : null;
    if (!startedAt) continue;
    const completedAt = typeof value.completedAt === "string" && value.completedAt ? value.completedAt : undefined;
    const opens = typeof value.opens === "number" && Number.isFinite(value.opens)
      ? Math.max(0, Math.trunc(value.opens))
      : 0;
    clean[id] = {
      version,
      step: clampStep(typeof value.step === "number" ? value.step : 0, stepCount),
      startedAt,
      ...(completedAt ? { completedAt } : {}),
      opens,
    };
  }
  return clean;
}

/** "About a minute", from the authored length. */
export function walkthroughLength(seconds: number): string {
  if (seconds < 45) return "Under a minute";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes === 1 ? "About a minute" : `About ${minutes} minutes`;
}
