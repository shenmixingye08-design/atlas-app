import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { WorkMemorySettings } from "@/components/settings/work-memory-settings";

export default function WorkMemorySettingsPage() {
  return (
    <AtlasAppShell active="work-memory" width="wide">
      <WorkMemorySettings />
    </AtlasAppShell>
  );
}
