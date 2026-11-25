"use client";

import { useState, type FormEvent } from "react";
import { Database, FolderArchive, ArrowDownUp, Users } from "lucide-react";
import { useAdmin } from "@/lib/platform/client";
import { AdminHeader, ErrorPanel, LoadingRows } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { BarChart } from "@/components/charts/bar-chart";

const pageSize = 25;
type Row = {
  id: string; email: string | null; snapshot: number | null; attachments: number; unmeasured: number;
  upload: number | null; download: number | null; pulls: number | null; saves: number | null;
  successes: number | null; failures: number | null; conflicts: number | null; coveredDays: number | null;
  lastSync: string | null; lastActive: string | null;
};
type Usage = {
  from: string; to: string; snapshotBytes: number; attachmentBytes: number; unmeasuredFiles: number;
  orphanAttachmentBytes: number; activeAccounts: number; upload: number | null; download: number | null; requests: number | null;
  total: number; items: Row[];
  transfer: { day: string; upload: number; download: number; requests: number }[];
  footprint: { day: string; snapshot_bytes: number; attachment_bytes: number }[];
};

function bytes(value: number | null) {
  if (value === null) return "Unavailable";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  return `${(value / 1024 ** 3).toFixed(1)} GiB`;
}

const shortDate = (value: string | null) => value ? new Date(value).toLocaleDateString("en-GB") : "Unavailable";
const metricLabels = {
  upload: "Estimated upload",
  download: "Estimated download",
  requests: "Observed sync requests",
  snapshot: "Logical snapshot history",
  attachments: "Measured attachment history",
} as const;
type HistoryMetric = keyof typeof metricLabels;

export default function ResourceUsagePage() {
  const [days, setDays] = useState("7");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("snapshot");
  const [offset, setOffset] = useState(0);
  const [metric, setMetric] = useState<HistoryMetric>("upload");
  const params = new URLSearchParams({ days, sort, q: query, limit: String(pageSize), offset: String(offset) });
  const { data, loading, error, reload } = useAdmin<Usage>(`resource-usage?${params}`);

  function search(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setQuery(input.trim());
  }

  const history = !data ? [] : metric === "snapshot" || metric === "attachments"
    ? data.footprint.map((row) => ({ day: row.day, value: metric === "snapshot" ? row.snapshot_bytes : row.attachment_bytes }))
    : data.transfer.map((row) => ({ day: row.day, value: row[metric] }));
  const format = metric === "requests" ? (n: number) => n.toLocaleString() : bytes;

  return (
    <div className="space-y-6">
      <AdminHeader icon={Database} title="Resource usage" description="Logical storage, measured attachments, and estimated synchronization transfer. Supabase Usage is authoritative for billing." />
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm text-paper/75">
          Period in UTC
          <Select value={days} onChange={(e) => { setDays(e.target.value); setOffset(0); }}>
            <option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="35">Last 35 days</option>
          </Select>
        </label>
        <form onSubmit={search} className="flex min-w-0 items-end gap-2">
          <label className="min-w-0 space-y-1 text-sm text-paper/75">Account email
            <Input value={input} onChange={(e) => setInput(e.target.value)} maxLength={100} placeholder="Search accounts" />
          </label>
          <Button type="submit" variant="outline">Search</Button>
        </form>
        <label className="space-y-1 text-sm text-paper/75">Largest first
          <Select value={sort} onChange={(e) => { setSort(e.target.value); setOffset(0); }}>
            <option value="snapshot">Logical snapshot</option>
            <option value="attachment">Attachments</option>
            <option value="transfer">Estimated transfer</option>
          </Select>
        </label>
      </div>
      <ErrorPanel error={error} onRetry={reload} />
      {loading && !data && <LoadingRows rows={4} />}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {([
              [Database, "Logical snapshot footprint", bytes(data.snapshotBytes), "Current server JSON size"],
              [FolderArchive, "Measured attachment storage", bytes(data.attachmentBytes), `${bytes(data.orphanAttachmentBytes)} outside current accounts · ${data.unmeasuredFiles} without size metadata`],
              [ArrowDownUp, "Estimated sync transfer", `${bytes(data.upload)} up · ${bytes(data.download)} down`, data.requests == null ? "No telemetry in this period" : `${data.requests} observed requests`],
              [Users, "Active accounts", String(data.activeAccounts), "Presence observed in the selected UTC period"],
            ] as const).map(([Icon, label, value, hint]) => (
              <Card key={label} className="space-y-2 p-4">
                <p className="flex items-center gap-2 text-sm text-paper/70"><Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />{label}</p>
                <p className="break-words font-display text-xl font-bold text-paper">{value}</p>
                <p className="text-xs text-paper/65">{hint}</p>
              </Card>
            ))}
          </div>

          <Card className="space-y-3 p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-semibold text-paper">Daily history</h2>
                <p className="text-xs text-paper/65">{data.from} to {data.to} UTC. Only observed dates are shown.</p>
              </div>
              <Select aria-label="History metric" value={metric} onChange={(event) => setMetric(event.target.value as HistoryMetric)}>
                {Object.entries(metricLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </Select>
            </div>
            {history.length ? (
              <>
                <div aria-hidden className="overflow-x-auto py-3"><BarChart
                  className="min-w-[18rem]" data={history.map((row) => ({ label: row.day.slice(5), sublabel: row.day, value: row.value }))}
                  height={112} formatValue={format}
                /></div>
                <details className="text-sm text-paper/75">
                  <summary className="cursor-pointer font-medium text-accent">Read daily values</summary>
                  <ul className="mt-2 max-h-56 space-y-1 overflow-auto">
                    {history.map((row) => <li key={row.day}>{row.day} · {format(row.value)}</li>)}
                  </ul>
                </details>
              </>
            ) : <p className="rounded-xl border border-dashed border-line p-4 text-sm text-paper/65">No measurements are available for this period.</p>}
          </Card>

          <Card className="min-w-0 space-y-4 p-4 sm:p-6">
            <div>
              <h2 className="font-semibold text-paper">Account usage</h2>
              <p className="mt-1 text-xs text-paper/65">Upload and download cover snapshot JSON only. Failed requests may not have reached the provider.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[53rem] text-left text-sm">
                <caption className="sr-only">Account footprint and estimated synchronization activity</caption>
                <thead className="border-b border-line text-xs text-paper/70">
                  <tr>{["Account", "Snapshot", "Attachments", "Upload / download", "Sync outcomes", "Coverage and activity"].map((label) =>
                    <th key={label} scope="col" className="p-2 font-semibold">{label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((row) => (
                    <tr key={row.id} className="align-top">
                      <th scope="row" className="max-w-48 break-all p-2 font-medium">{row.email ?? row.id}</th>
                      <td className="p-2">{bytes(row.snapshot)}</td>
                      <td className="p-2">{bytes(row.attachments)}{row.unmeasured > 0 && <p className="text-xs text-paper/65">{row.unmeasured} missing sizes</p>}</td>
                      <td className="p-2">{bytes(row.upload)} / {bytes(row.download)}</td>
                      <td className="p-2">{row.pulls == null ? "Unavailable" : <>{row.pulls} pulls · {row.saves} saves<p className="text-xs text-paper/65">{row.successes} succeeded · {row.failures} failed · {row.conflicts} conflicts</p></>}</td>
                      <td className="p-2 text-xs">{row.coveredDays ?? 0} observed days<p>Last reported sync {shortDate(row.lastSync)}</p><p>Last active {shortDate(row.lastActive)}</p></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.items.length === 0 && <p className="p-3 text-sm text-paper/65">No accounts match this search.</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-paper/65">
              <span className="mr-auto">{data.total ? offset + 1 : 0}–{Math.min(offset + data.items.length, data.total)} of {data.total}</span>
              <Button size="sm" variant="outline" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Previous</Button>
              <Button size="sm" variant="outline" disabled={loading || offset + pageSize >= data.total} onClick={() => setOffset(offset + pageSize)}>Next</Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
