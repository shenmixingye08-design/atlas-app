import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getExecutiveDashboardSnapshot } from "@/lib/owner/executive";
import { formatOwnerUsd } from "@/lib/owner/format";

export const dynamic = "force-dynamic";

export default async function OwnerDeliverableCostPage() {
  await requireAtlasOwner();
  const snapshot = await getExecutiveDashboardSnapshot("month");

  return (
    <OwnerShell active="deliverableCost">
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">成果物原価</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            成果物タイプ別の生成回数・平均原価・平均時間・成功率
          </p>
        </header>
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">成果物</th>
                <th className="px-4 py-3 font-medium">生成回数</th>
                <th className="px-4 py-3 font-medium">平均API原価</th>
                <th className="px-4 py-3 font-medium">平均生成時間</th>
                <th className="px-4 py-3 font-medium">成功率</th>
                <th className="px-4 py-3 font-medium">失敗率</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.deliverableCosts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-[var(--text-muted)]">
                    データなし
                  </td>
                </tr>
              ) : (
                snapshot.deliverableCosts.map((row) => (
                  <tr key={row.featureId} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3 font-medium">{row.label}</td>
                    <td className="px-4 py-3 tabular-nums">{row.generationCount}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.avgCostUsd != null
                        ? formatOwnerUsd(row.avgCostUsd, true)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.avgDurationMs != null
                        ? `${(row.avgDurationMs / 1000).toFixed(1)}s`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.successRatePercent != null
                        ? `${row.successRatePercent}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.failureRatePercent != null
                        ? `${row.failureRatePercent}%`
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </OwnerShell>
  );
}
