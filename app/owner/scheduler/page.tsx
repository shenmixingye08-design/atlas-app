import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { OwnerNav } from "@/components/owner/owner-nav";
import { SchedulerReliabilityDashboard } from "@/components/owner/scheduler-reliability-dashboard";

export const dynamic = "force-dynamic";

export default async function OwnerSchedulerPage() {
  await requireAtlasOwner();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8">
      <OwnerNav active="scheduler" />
      <header className="space-y-2">
        <h1 className="text-display text-foreground">Scheduler Reliability</h1>
        <p className="text-body text-[var(--text-secondary)]">
          1分tick・Lease・Heartbeat・Recovery・Queue/Running/Retry/P95 を監視します。
        </p>
      </header>
      <SchedulerReliabilityDashboard />
    </div>
  );
}
