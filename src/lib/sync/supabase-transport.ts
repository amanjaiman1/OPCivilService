import { estimateSnapshotBytes, syncUsage } from "./usage";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  SyncError,
  type HoldSummary,
  type InitIntent,
  type InitOutcome,
  type RecoveryReason,
  type RemoteDoc,
  type RemoteHead,
  type ReportDetail,
  type SaveOutcome,
  type Snapshot,
  type SyncTransport,
} from "./engine";

/**
 * The sync engine's view of Supabase. Reads are against the caller's own
 * `chronicle_state` row (Row Level Security limits them to it, and the row's
 * owner is checked again here). Writes go through the database functions in
 * `supabase/migrations/20261216120000_sync_safety.sql`, which act only on
 * `auth.uid()`: `chronicle_save` (compare-and-swap, destructive-change guard,
 * schema guard), `chronicle_init` (the first snapshot, decided by the server)
 * and `chronicle_confirm_replace` (a held save, explicitly confirmed).
 *
 * Every call first checks that the signed-in user is still the account this
 * transport was made for. After a sign-out or a switch, a request that was
 * already queued fails instead of reading or writing the wrong account.
 */
export interface TransportOptions {
  /** The snapshot schema this app writes (`STORE_VERSION`). */
  schema: number;
  /** This device's label for the account's trail (`lib/sync/device.ts`). */
  device: () => string;
}

export type DeviceEvent =
  | "hydrate_failed"
  | "stamp_mismatch"
  | "local_quarantined"
  | "recovery_shown"
  | "conflicts_recorded"
  | "outdated_client"
  | "hold_kept_cloud"
  | "offline_session";

const reported = new Map<string, number>();
const REPORT_EVERY_MS = 10 * 60_000;

/**
 * Adds a device-side event to the account's diagnostic trail: a name, a
 * version and a few numbers, never any of the student's data. Fire and
 * forget, at most once per event every ten minutes from this tab.
 */
export function reportSyncEvent(
  client: SupabaseClient,
  event: DeviceEvent,
  device: string,
  version: number | null,
  detail?: ReportDetail,
): void {
  const last = reported.get(event) ?? 0;
  if (Date.now() - last < REPORT_EVERY_MS) return;
  reported.set(event, Date.now());
  void Promise.resolve(
    client.rpc("chronicle_report", {
      p_event: event,
      p_device: device,
      p_version: version,
      p_detail: detail ?? null,
    }),
  ).catch(() => undefined);
}

type Row = Record<string, unknown>;
const firstRow = (data: unknown): Row | undefined =>
  (Array.isArray(data) ? data[0] : data) as Row | undefined;
const num = (v: unknown): number => Number(v ?? 0);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function headOf(row: Row): RemoteHead {
  return {
    version: num(row.version),
    updatedAt: str(row.updated_at),
    schema: row.schema_version == null ? undefined : num(row.schema_version),
  };
}

function holdSummaryOf(detail: unknown): HoldSummary {
  const d = (detail ?? {}) as Partial<HoldSummary>;
  return {
    removed: num(d.removed),
    before: num(d.before),
    lists: d.lists && typeof d.lists === "object" ? (d.lists as HoldSummary["lists"]) : {},
    profileReset: Boolean(d.profileReset),
  };
}

function saveOutcomeOf(data: unknown): SaveOutcome {
  const row = firstRow(data);
  if (!row) throw new SyncError("The cloud didn't confirm the save.", "server");
  switch (row.status) {
    case "saved":
    case "conflict":
    case "outdated":
      return { status: row.status, head: headOf(row) };
    case "missing":
      return { status: "missing" };
    case "expired":
      return { status: "expired" };
    case "held":
      return {
        status: "held",
        head: headOf(row),
        hold: { id: String(row.hold_id), summary: holdSummaryOf(row.detail) },
      };
    default:
      throw new SyncError("The cloud gave an answer this version doesn't understand.", "server");
  }
}

export function createSupabaseTransport(
  client: SupabaseClient,
  accountId: string,
  options: TransportOptions,
): SyncTransport {
  const measure = syncUsage(client, accountId);
  async function assertAccount(): Promise<void> {
    const { data } = await client.auth.getSession();
    const id = data.session?.user.id;
    // No usable session yet (an expired token while offline): retry later.
    if (!id) throw new SyncError("Waiting to reconnect your session.", "auth");
    if (id !== accountId) throw new SyncError("The signed-in account changed.", "stopped");
  }

  /** A row that isn't this account's is never used, whatever let it through. */
  function assertOwner(row: Row): void {
    if (row.user_id !== accountId) {
      throw new SyncError("The cloud returned a copy that isn't yours. It was ignored.", "server");
    }
  }

  return {
    async head(): Promise<RemoteHead | null> {
      await assertAccount();
      // `.retry(false)`: the client would otherwise retry a failed read three
      // times over 7 seconds before saying so, which kept "Offline" off the
      // screen and held up a sign-out by as long. The engine has its own
      // backoff (2 s to 60 s), so a failure is reported at once instead.
      const { data, error, status } = await client
        .from("chronicle_state")
        .select("user_id, version, updated_at, schema_version")
        .eq("user_id", accountId)
        .retry(false)
        .maybeSingle();
      if (error) throw classify(error, status);
      if (!data) return null;
      assertOwner(data);
      return headOf(data);
    },

    async fetch(): Promise<RemoteDoc | null> {
      await assertAccount();
      const { data, error, status } = await client
        .from("chronicle_state")
        .select("user_id, data, version, updated_at, schema_version")
        .eq("user_id", accountId)
        .retry(false)
        .maybeSingle();
      measure("pull", error ? "failure" : "success", estimateSnapshotBytes(data?.data));
      if (error) throw classify(error, status);
      if (!data) return null;
      assertOwner(data);
      const snapshot = (data as Row).data;
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        throw new SyncError("Your cloud copy couldn't be read. Nothing was changed.", "server");
      }
      return { ...headOf(data), data: snapshot as Snapshot };
    },

    async save(snapshot: Snapshot, baseVersion: number): Promise<SaveOutcome> {
      await assertAccount();
      const { data, error, status } = await client.rpc("chronicle_save", {
        p_data: snapshot,
        p_base_version: baseVersion,
        p_schema: options.schema,
        p_device: options.device(),
      });
      const outcome = firstRow(data)?.status;
      measure("save", outcome === "conflict" ? "conflict" : !error && outcome === "saved" ? "success" : "failure", estimateSnapshotBytes(snapshot));
      if (error) throw classify(error, status);
      return saveOutcomeOf(data);
    },

    async init(snapshot: Snapshot, intent: InitIntent): Promise<InitOutcome> {
      await assertAccount();
      const { data, error, status } = await client.rpc("chronicle_init", {
        p_data: snapshot,
        p_schema: options.schema,
        p_device: options.device(),
        p_intent: intent,
      });
      const row = firstRow(data);
      measure("save", !error && (row?.status === "created" || row?.status === "exists") ? "success" : "failure", estimateSnapshotBytes(snapshot));
      if (error) throw classify(error, status);
      if (!row) throw new SyncError("The cloud didn't answer.", "server");
      if (row.status === "created" || row.status === "exists") return { status: row.status, head: headOf(row) };
      if (row.status === "needs_recovery") {
        const reason = (row.detail as { reason?: string } | null)?.reason;
        return { status: "needs_recovery", reason: (reason === "missing" ? "missing" : "unrecognised") as RecoveryReason };
      }
      throw new SyncError("The cloud gave an answer this version doesn't understand.", "server");
    },

    async confirmReplace(holdId: string, snapshot: Snapshot): Promise<SaveOutcome> {
      await assertAccount();
      const { data, error, status } = await client.rpc("chronicle_confirm_replace", {
        p_hold_id: holdId,
        p_data: snapshot,
        p_schema: options.schema,
        p_device: options.device(),
      });
      const outcome = firstRow(data)?.status;
      measure("save", outcome === "conflict" ? "conflict" : !error && outcome === "saved" ? "success" : "failure", estimateSnapshotBytes(snapshot));
      if (error) throw classify(error, status);
      return saveOutcomeOf(data);
    },

    report(event, version, detail) {
      reportSyncEvent(client, event, options.device(), version, detail);
    },
  };
}

/** Turns a PostgREST failure into something the engine can act on. */
export function classify(error: PostgrestError, status: number): SyncError {
  const code = error.code ?? "";
  const message = error.message ?? "Sync failed.";
  if (status === 0 || /fetch|network|load failed/i.test(message)) {
    return new SyncError("You're offline. Changes are saved on this device.", "network");
  }
  if (status === 401 || code === "PGRST301" || code === "PGRST303") {
    return new SyncError("Your session needs refreshing.", "auth");
  }
  // Column, function or schema missing: the database migration hasn't been run.
  if (["42703", "42883", "PGRST202", "PGRST204", "PGRST200"].includes(code)) {
    return new SyncError(
      "Cloud sync needs a database update. Run the SQL migration described in the README.",
      "schema",
    );
  }
  if (["22023", "23514", "42501"].includes(code) || status === 413) {
    return new SyncError(`The cloud refused this save: ${message}`, "rejected");
  }
  if (status === 429 || status >= 500) {
    return new SyncError("The cloud is busy. Retrying shortly.", "network");
  }
  return new SyncError(message, "server");
}
