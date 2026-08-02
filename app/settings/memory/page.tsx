import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { PersonalMemorySettingsPanel } from "@/components/settings/personal-memory-settings";
import { MemoryExclusivityDashboard } from "@/components/settings/memory-exclusivity-dashboard";

export default function MemorySettingsPage() {
  return (
    <AtlasAppShell active="settings" width="default">
      <div className="space-y-10">
        <MemoryExclusivityDashboard />
        <PersonalMemorySettingsPanel />
      </div>
    </AtlasAppShell>
  );
}
