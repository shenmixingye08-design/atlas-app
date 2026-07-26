import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerRefreshControl } from "@/components/owner/owner-refresh-control";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getExecutiveDashboardSnapshot } from "@/lib/owner/executive";
import { formatOwnerUsd } from "@/lib/owner/format";

export const dynamic = "force-dynamic";

export default async function OwnerAiCostPage() {
  await requireAtlasOwner();
  const snapshot = await getExecutiveDashboardSnapshot("month");

  return (
    <OwnerShell active="aiCost">
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">AI原価管理</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              OpenAI利用状況をモデル別にリアルタイム集計（AI利用台帳 × 料金表）
            </p>
          </div>
          <OwnerRefreshControl />
        </header>

        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">モデル</th>
                <th className="px-4 py-3 font-medium">API</th>
                <th className="px-4 py-3 font-medium">利用回数</th>
                <th className="px-4 py-3 font-medium">入力トークン</th>
                <th className="px-4 py-3 font-medium">出力トークン</th>
                <th className="px-4 py-3 font-medium">API料金</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.aiByModel.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-[var(--text-muted)]">
                    利用データなし
                  </td>
                </tr>
              ) : (
                snapshot.aiByModel.map((row) => (
                  <tr key={row.model} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3 font-medium">{row.displayName}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {row.apiHints.join(" / ")}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{row.requests}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.inputTokens.toLocaleString("ja-JP")}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.outputTokens.toLocaleString("ja-JP")}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {formatOwnerUsd(row.costUsd, true)}
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
