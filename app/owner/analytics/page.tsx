import { OwnerShell } from "@/components/owner/owner-shell";
import { ExecutivePeriodSwitch } from "@/components/owner/executive/period-switch";
import { ExecutiveSeriesChart } from "@/components/owner/executive/series-chart";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  getExecutiveDashboardSnapshot,
  type ExecutivePeriod,
} from "@/lib/owner/executive";

export const dynamic = "force-dynamic";

function parsePeriod(value: string | string[] | undefined): ExecutivePeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    raw === "today" ||
    raw === "week" ||
    raw === "month" ||
    raw === "year"
  ) {
    return raw;
  }
  return "month";
}

export default async function OwnerAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string }>;
}) {
  await requireAtlasOwner();
  const params = searchParams ? await searchParams : {};
  const period = parsePeriod(params.period);
  const snapshot = await getExecutiveDashboardSnapshot(period);

  return (
    <OwnerShell active="analytics">
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">分析</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              日別 / 週別 / 月別 / 年別の実データ推移
            </p>
          </div>
          <ExecutivePeriodSwitch period={period} />
        </header>
        <ExecutiveSeriesChart series={snapshot.series} title={`${period} 推移`} />
      </div>
    </OwnerShell>
  );
}
