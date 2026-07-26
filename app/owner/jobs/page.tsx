import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerRefreshControl } from "@/components/owner/owner-refresh-control";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getExecutiveDashboardSnapshot } from "@/lib/owner/executive";
import { formatOwnerDate } from "@/lib/owner/format";
import type { JobMonitorRow } from "@/lib/owner/executive";

export const dynamic = "force-dynamic";

function JobTable({
  title,
  rows,
}: {
  title: string;
  rows: readonly JobMonitorRow[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        {title}{" "}
        <span className="text-sm font-normal text-[var(--text-muted)]">
          ({rows.length})
        </span>
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">種別</th>
              <th className="px-4 py-3 font-medium">状態</th>
              <th className="px-4 py-3 font-medium">進捗</th>
              <th className="px-4 py-3 font-medium">更新</th>
              <th className="px-4 py-3 font-medium">エラー</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-[var(--text-muted)]">
                  該当ジョブなし
                </td>
              </tr>
            ) : (
              rows.slice(0, 50).map((row) => (
                <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{row.id.slice(0, 12)}</td>
                  <td className="px-4 py-3">{row.jobType}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3 tabular-nums">{row.progressPercent}%</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {formatOwnerDate(row.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-[var(--error)]">
                    {row.lastErrorMessage ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function OwnerJobsPage() {
  await requireAtlasOwner();
  const snapshot = await getExecutiveDashboardSnapshot("month");

  return (
    <OwnerShell active="jobs">
      <div className="space-y-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">ジョブ監視</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              atlas_automation_jobs の実レコード一覧
            </p>
          </div>
          <OwnerRefreshControl />
        </header>
        <JobTable title="処理中" rows={snapshot.jobs.running} />
        <JobTable title="待機中" rows={snapshot.jobs.queued} />
        <JobTable title="失敗" rows={snapshot.jobs.failed} />
        <JobTable title="完了" rows={snapshot.jobs.completed} />
      </div>
    </OwnerShell>
  );
}
