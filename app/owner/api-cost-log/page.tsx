import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getExecutiveDashboardSnapshot } from "@/lib/owner/executive";
import { formatOwnerUsd } from "@/lib/owner/format";

export const dynamic = "force-dynamic";

export default async function OwnerApiCostLogPage() {
  await requireAtlasOwner();
  const snapshot = await getExecutiveDashboardSnapshot("month");

  return (
    <OwnerShell active="apiCostLog">
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">APIコストログ</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            成果物ごとにモデル別の実原価を保存・表示します。
          </p>
        </header>
        <div className="grid gap-4">
          {snapshot.apiCostLog.length === 0 ? (
            <p className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--text-muted)]">
              記録なし
            </p>
          ) : (
            snapshot.apiCostLog.map((row) => (
              <article
                key={row.featureId}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">{row.label}</h2>
                  <p className="text-lg font-semibold tabular-nums">
                    合計 {formatOwnerUsd(row.totalCostUsd, true)}
                  </p>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  生成 {row.generationCount} 回
                </p>
                <ul className="mt-4 space-y-2">
                  {row.models.map((model) => (
                    <li
                      key={model.model}
                      className="flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-sm"
                    >
                      <span>
                        {model.displayName}
                        <span className="ml-2 text-xs text-[var(--text-muted)]">
                          {model.requests}回
                        </span>
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatOwnerUsd(model.costUsd, true)}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))
          )}
        </div>
      </div>
    </OwnerShell>
  );
}
