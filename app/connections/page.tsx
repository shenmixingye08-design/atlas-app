import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { ConnectionsDashboard } from "@/components/connections/connections-dashboard";
import { LiveIntegrationsPanel } from "@/components/connections/live-integrations-panel";

export default function ConnectionsPage() {
  return (
    <AtlasAppShell>
      <div className="mx-auto max-w-5xl space-y-12 px-4 py-8 sm:px-6">
        <LiveIntegrationsPanel />
        <ConnectionsDashboard />
      </div>
    </AtlasAppShell>
  );
}
