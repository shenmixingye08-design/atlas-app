import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { PersonalMemorySettingsPanel } from "@/components/settings/personal-memory-settings";

export default function MemorySettingsPage() {
  return (
    <AtlasAppShell active="settings" width="default">
      <PersonalMemorySettingsPanel />
    </AtlasAppShell>
  );
}
