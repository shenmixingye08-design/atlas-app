import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getExecutiveDashboardSnapshot } from "@/lib/owner/executive";

export const dynamic = "force-dynamic";

export default async function OwnerDeliverableAnalyticsPage() {
  await requireAtlasOwner();
  const snapshot = await getExecutiveDashboardSnapshot("month");

  return (
    <OwnerShell active="deliverableAnalytics">
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">成果物分析</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            人気ランキング・生成回数・平均時間。評価・再生成率が未計測の項目は「—」です。
          </p>
        </header>
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">順位</th>
                <th className="px-4 py-3 font-medium">成果物</th>
                <th className="px-4 py-3 font-medium">生成回数</th>
                <th className="px-4 py-3 font-medium">平均評価</th>
                <th className="px-4 py-3 font-medium">平均時間</th>
                <th className="px-4 py-3 font-medium">再生成率</th>
                <th className="px-4 py-3 font-medium">成功率</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.deliverableAnalytics.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-[var(--text-muted)]">
                    データなし
                  </td>
                </tr>
              ) : (
                snapshot.deliverableAnalytics.map((row, index) => (
                  <tr key={row.featureId} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3 tabular-nums">{index + 1}</td>
                    <td className="px-4 py-3 font-medium">{row.label}</td>
                    <td className="px-4 py-3 tabular-nums">{row.generationCount}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.avgRating ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.avgDurationMs != null
                        ? `${(row.avgDurationMs / 1000).toFixed(1)}s`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.regenRatePercent != null
                        ? `${row.regenRatePercent}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.successRatePercent != null
                        ? `${row.successRatePercent}%`
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
