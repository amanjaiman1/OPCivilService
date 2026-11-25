import type { SupabaseClient } from "@supabase/supabase-js";

const counters = () => ({
  p_pulls: 0, p_saves: 0, p_successes: 0, p_failures: 0, p_conflicts: 0, p_upload: 0, p_download: 0,
});

/** Counts estimated snapshot JSON bytes only, never the snapshot itself. */
export function estimateSnapshotBytes(data: unknown): number {
  if (data == null) return 0;
  try {
    return new TextEncoder().encode(JSON.stringify(data)).length;
  } catch {
    return 0;
  }
}

export function syncUsage(client: SupabaseClient, accountId: string) {
  let counts = counters();
  let pending: (ReturnType<typeof counters> & { p_account: string; p_batch: string }) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;

  async function flush() {
    timer = undefined;
    if (flushing) return;
    flushing = true;
    try {
      const { data } = await client.auth.getSession();
      if (data.session?.user.id !== accountId) {
        pending = null;
        counts = counters();
        return;
      }
      if (!pending && counts.p_pulls + counts.p_saves) {
        pending = { ...counts, p_account: accountId, p_batch: crypto.randomUUID() };
        counts = counters();
      }
      if (!pending) return;
      const { error } = await client.rpc("platform_record_sync_usage", pending);
      if (!error || error.code === "PGRST202") pending = null;
    } catch {
      // Keep only this batch and a bounded new batch until the next attempted sync.
    } finally {
      flushing = false;
    }
  }

  return (type: "pull" | "save", result: "success" | "failure" | "conflict", bytes: number) => {
    if (typeof window === "undefined") return;
    if (counts.p_pulls + counts.p_saves < 256) {
      counts[type === "pull" ? "p_pulls" : "p_saves"]++;
      counts[result === "success" ? "p_successes" : result === "conflict" ? "p_conflicts" : "p_failures"]++;
      const field = type === "pull" ? "p_download" : "p_upload";
      counts[field] = Math.min(536870912, counts[field] + bytes);
    }
    if (!timer && !flushing) timer = setTimeout(() => void flush(), 90_000);
  };
}
