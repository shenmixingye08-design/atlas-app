import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerRefreshControl } from "@/components/owner/owner-refresh-control";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getExecutiveDashboardSnapshot } from "@/lib/owner/executive";
import { cn } from "@/lib/design-system/cn";

export const dynamic = "force-dynamic";

export default async function OwnerDepartmentsPage() {
  await requireAtlasOwner();
  const snapshot = await getExecutiveDashboardSnapshot("month");

  return (
    <OwnerShell active="departments">
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">AI部署モニター</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              実テレメトリのみ。活動がない部署は待機として表示します（デモ埋め込みなし）。
            </p>
          </div>
          <OwnerRefreshControl />
        </header>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {snapshot.departments.map((dept) => (
            <div
              key={dept.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    dept.status === "running" && "bg-[var(--success)]",
                    dept.status === "idle" && "bg-[var(--warning)]",
                    dept.status === "error" && "bg-[var(--error)]",
                  )}
                />
                <h2 className="text-lg font-semibold">{dept.label}</h2>
              </div>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {dept.status === "running"
                  ? "🟢 稼働中"
                  : dept.status === "error"
                    ? "🔴 エラー"
                    : "🟡 待機"}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">処理件数</dt>
                  <dd className="tabular-nums">{dept.processedCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">平均処理時間</dt>
                  <dd className="tabular-nums">
                    {dept.avgDurationMs != null
                      ? `${(dept.avgDurationMs / 1000).toFixed(1)}s`
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Queue数</dt>
                  <dd className="tabular-nums">{dept.queueCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">エラー</dt>
                  <dd className="tabular-nums">{dept.errorCount}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </div>
    </OwnerShell>
  );
}
