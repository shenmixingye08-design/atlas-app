import { MaintenanceModePanel } from "@/components/owner/maintenance-mode-panel";
import { MonitoringDashboardPanel } from "@/components/owner/monitoring-dashboard-panel";
import { SystemStatusPanel } from "@/components/owner/system-status-panel";
import { ExecutiveMetricCard } from "@/components/owner/executive/metric-card";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getExecutiveDashboardSnapshot } from "@/lib/owner/executive";

export const dynamic = "force-dynamic";

export default async function OwnerSystemStatusPage() {
  await requireAtlasOwner();
  const executive = await getExecutiveDashboardSnapshot("month");

  return (
    <OwnerShell active="systemStatus">
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">システム監視</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            CPU / Memory などホストメトリクスは Vercel 非公開のため未接続表示。その他は実ヘルスと実ジョブ指標です。
          </p>
        </header>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {executive.system.map((metric, index) => (
            <ExecutiveMetricCard
              key={metric.id}
              index={index}
              card={{
                id: metric.id,
                label: metric.label,
                value: metric.value,
                availability: metric.availability,
                statusMessage: metric.statusMessage,
                hint: null,
                accent: "default",
              }}
            />
          ))}
        </section>
        <MonitoringDashboardPanel />
        <MaintenanceModePanel />
        <SystemStatusPanel />
      </div>
    </OwnerShell>
  );
}
