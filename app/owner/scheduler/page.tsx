import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { OwnerNav } from "@/components/owner/owner-nav";
import { SchedulerDashboardPanel } from "@/components/owner/scheduler-dashboard-panel";

export const dynamic = "force-dynamic";

export default async function OwnerSchedulerPage() {
  await requireAtlasOwner();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <OwnerNav active="scheduler" />
      <header className="space-y-2">
        <h1 className="text-display text-foreground">Scheduler</h1>
        <p className="text-body text-[var(--text-secondary)]">
          History / Metrics / Health / Alerts。実測証跡のみを表示します。
        </p>
      </header>
      <SchedulerDashboardPanel />
    </div>
  );
}
