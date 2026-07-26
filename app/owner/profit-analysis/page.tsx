import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getExecutiveDashboardSnapshot } from "@/lib/owner/executive";
import { formatOwnerJpy, formatOwnerUsd } from "@/lib/owner/format";

export const dynamic = "force-dynamic";

export default async function OwnerProfitAnalysisPage() {
  await requireAtlasOwner();
  const snapshot = await getExecutiveDashboardSnapshot("month");

  return (
    <OwnerShell active="profitAnalysis">
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">利益分析</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            ユーザー単位の売上・API原価・利益（実契約 × 実利用台帳）
          </p>
        </header>
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">ユーザー</th>
                <th className="px-4 py-3 font-medium">プラン</th>
                <th className="px-4 py-3 font-medium">売上</th>
                <th className="px-4 py-3 font-medium">API原価</th>
                <th className="px-4 py-3 font-medium">利益</th>
                <th className="px-4 py-3 font-medium">利用回数</th>
                <th className="px-4 py-3 font-medium">平均生成時間</th>
                <th className="px-4 py-3 font-medium">平均成果物数</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.userProfits.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-[var(--text-muted)]">
                    データなし
                  </td>
                </tr>
              ) : (
                snapshot.userProfits.map((row) => (
                  <tr key={row.userId} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3 font-medium">{row.displayName}</td>
                    <td className="px-4 py-3">{row.planId}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.revenueJpy != null ? formatOwnerJpy(row.revenueJpy) : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatOwnerUsd(row.apiCostUsd, true)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.profitJpy != null ? formatOwnerJpy(row.profitJpy) : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{row.runCount}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.avgDurationMs != null
                        ? `${(row.avgDurationMs / 1000).toFixed(1)}s`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.avgDeliverables ?? "—"}
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
