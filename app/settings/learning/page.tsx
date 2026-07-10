import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LearningEngineSettings } from "@/components/settings/learning-engine-settings";

export default function LearningSettingsPage() {
  return (
    <AtlasAppShell active="learning" width="wide">
      <LearningEngineSettings />
    </AtlasAppShell>
  );
}
