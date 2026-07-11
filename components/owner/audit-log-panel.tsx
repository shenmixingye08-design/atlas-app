"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AuditCategory,
  AuditLogSnapshot,
  AuditResult,
  AuditRetentionDays,
} from "@/lib/owner/audit-log/types";
import { AUDIT_RETENTION_OPTIONS } from "@/lib/owner/audit-log/types";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

type Filters = {
  q: string;
  userId: string;
  category: AuditCategory | "all";
  result: AuditResult | "all";
  from: string;
  to: string;
};

const CATEGORIES: Array<AuditCategory | "all"> = [
  "all",
  "auth",
  "billing",
  "integration",
  "automation",
  "commander",
  "request",
  "data",
  "account",
  "owner",
  "other",
];

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function buildQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.userId.trim()) params.set("userId", filters.userId.trim());
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.result !== "all") params.set("result", filters.result);
  if (filters.from) params.set("from", new Date(filters.from).toISOString());
  if (filters.to) {
    const end = new Date(filters.to);
    end.setHours(23, 59, 59, 999);
    params.set("to", end.toISOString());
  }
  params.set("limit", "500");
  return params.toString();
}

async function fetchSnapshot(filters: Filters): Promise<AuditLogSnapshot> {
  const response = await fetch(`/api/owner/audit-log?${buildQuery(filters)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to load audit log");
  return response.json() as Promise<AuditLogSnapshot>;
}

export function AuditLogPanel() {
  const [filters, setFilters] = useState<Filters>({
    q: "",
    userId: "",
    category: "all",
    result: "all",
    from: "",
    to: "",
  });
  const [applied, setApplied] = useState<Filters>(filters);
  const [snapshot, setSnapshot] = useState<AuditLogSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (next: Filters) => {
    try {
      setSnapshot(await fetchSnapshot(next));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    }
  }, []);

  useEffect(() => {
    void load(applied);
  }, [applied, load]);

  const retention = snapshot?.settings.retentionDays ?? 90;

  const categoryLabel = useMemo(
    () =>
      ({
        all: ui.owner.auditLogCategoryAll,
        auth: ui.owner.auditLogCategoryAuth,
        billing: ui.owner.auditLogCategoryBilling,
        integration: ui.owner.auditLogCategoryIntegration,
        automation: ui.owner.auditLogCategoryAutomation,
        commander: ui.owner.auditLogCategoryCommander,
        request: ui.owner.auditLogCategoryRequest,
        data: ui.owner.auditLogCategoryData,
        account: ui.owner.auditLogCategoryAccount,
        owner: ui.owner.auditLogCategoryOwner,
        other: ui.owner.auditLogCategoryOther,
      }) as Record<AuditCategory | "all", string>,
    [],
  );

  const setRetention = async (days: AuditRetentionDays) => {
    setBusy(true);
    try {
      const response = await fetch("/api/owner/audit-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_retention", retentionDays: days }),
      });
      if (!response.ok) throw new Error("Failed to update retention");
      await load(applied);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.updateFailed);
    } finally {
      setBusy(false);
    }
  };

  const downloadCsv = () => {
    const url = `/api/owner/audit-log?${buildQuery(applied)}&format=csv`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (!snapshot && !error) {
    return <LoadingState message={ui.owner.auditLogLoading} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {ui.owner.auditLogTitle}
          </h1>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            {ui.owner.auditLogSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => downloadCsv()}
          >
            {ui.owner.auditLogExportCsv}
          </Button>
        </div>
      </div>

      {error && <ErrorState message={error} />}

      <Card padding="lg" className="space-y-4 shadow-[var(--shadow-soft)]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--foreground-muted)]">
              {ui.owner.auditLogSearch}
            </span>
            <input
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder={ui.owner.auditLogSearchPlaceholder}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--foreground-muted)]">
              {ui.owner.auditLogUser}
            </span>
            <input
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
              value={filters.userId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, userId: e.target.value }))
              }
              placeholder="user_..."
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--foreground-muted)]">
              {ui.owner.auditLogCategory}
            </span>
            <select
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
              value={filters.category}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  category: e.target.value as Filters["category"],
                }))
              }
            >
              {CATEGORIES.map((id) => (
                <option key={id} value={id}>
                  {categoryLabel[id]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--foreground-muted)]">
              {ui.owner.auditLogResult}
            </span>
            <select
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
              value={filters.result}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  result: e.target.value as Filters["result"],
                }))
              }
            >
              <option value="all">{ui.owner.auditLogResultAll}</option>
              <option value="success">{ui.owner.auditLogResultSuccess}</option>
              <option value="failure">{ui.owner.auditLogResultFailure}</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--foreground-muted)]">
              {ui.owner.auditLogFrom}
            </span>
            <input
              type="date"
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
              value={filters.from}
              onChange={(e) =>
                setFilters((f) => ({ ...f, from: e.target.value }))
              }
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--foreground-muted)]">
              {ui.owner.auditLogTo}
            </span>
            <input
              type="date"
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            onClick={() => setApplied({ ...filters })}
            disabled={busy}
          >
            {ui.owner.auditLogApplyFilters}
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--foreground-muted)]">
              {ui.owner.auditLogRetention}
            </span>
            <select
              className="rounded-md border border-[var(--border)] bg-transparent px-2 py-1"
              value={retention}
              disabled={busy}
              onChange={(e) =>
                void setRetention(Number(e.target.value) as AuditRetentionDays)
              }
            >
              {AUDIT_RETENTION_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {ui.owner.auditLogRetentionDays(days)}
                </option>
              ))}
            </select>
          </label>
          {snapshot && (
            <span className="text-xs text-[var(--foreground-muted)]">
              {ui.owner.auditLogCount(snapshot.total)}
            </span>
          )}
        </div>
      </Card>

      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        {!snapshot?.entries.length ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.owner.auditLogEmpty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--foreground-muted)]">
                  <th className="px-2 py-2 font-medium">
                    {ui.owner.auditLogColAt}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {ui.owner.auditLogColUser}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {ui.owner.auditLogColAction}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {ui.owner.auditLogColTarget}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {ui.owner.auditLogColResult}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {ui.owner.auditLogColIp}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {ui.owner.auditLogColReason}
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.entries.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--border-subtle)] align-top"
                  >
                    <td className="px-2 py-2 whitespace-nowrap">
                      {formatDate(row.at)}
                    </td>
                    <td className="px-2 py-2">
                      <div>{row.email ?? "—"}</div>
                      <div className="text-xs text-[var(--foreground-muted)]">
                        {row.userId ?? "—"}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div>{row.action}</div>
                      <div className="text-xs text-[var(--foreground-muted)]">
                        {categoryLabel[row.category]}
                      </div>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {row.targetId ?? "—"}
                    </td>
                    <td className="px-2 py-2">
                      {row.result === "success"
                        ? ui.owner.auditLogResultSuccess
                        : ui.owner.auditLogResultFailure}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {row.ip ?? "—"}
                    </td>
                    <td className="px-2 py-2 max-w-[240px] break-words">
                      {row.reason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
