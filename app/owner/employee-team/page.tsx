import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { EmployeeTeamStatsPanel } from "@/components/owner/employee-team-stats-panel";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  getEmployeeTeamStatsSnapshot,
  seedDemoEmployeeStats,
} from "@/lib/team-collaboration/telemetry";
import { ui } from "@/lib/i18n";

export default async function OwnerEmployeeTeamPage() {
  await requireAtlasOwner();
  seedDemoEmployeeStats();
  const snapshot = getEmployeeTeamStatsSnapshot();

  return (
    <OwnerShell>
      <div className="space-y-8">
        <OwnerNav active="employeeTeam" />
        <header className="space-y-2">
          <p className="text-caption">{ui.owner.pageEyebrow}</p>
          <h1 className="text-display text-foreground">{ui.teamCollaboration.ownerTitle}</h1>
          <p className="text-body text-[var(--foreground-muted)]">
            {ui.teamCollaboration.ownerSubtitle}
          </p>
        </header>
        <EmployeeTeamStatsPanel snapshot={snapshot} />
      </div>
    </OwnerShell>
  );
}
