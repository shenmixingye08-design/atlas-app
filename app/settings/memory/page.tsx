import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { PersonalMemorySettingsPanel } from "@/components/settings/personal-memory-settings";
import { ProductionMemoryPanel } from "@/components/settings/production-memory-panel";

export default function MemorySettingsPage() {
  return (
    <AtlasAppShell active="settings" width="default">
      <div className="space-y-12">
        <ProductionMemoryPanel />
        <PersonalMemorySettingsPanel />
      </div>
    </AtlasAppShell>
  );
}
