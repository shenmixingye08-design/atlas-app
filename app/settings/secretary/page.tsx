import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { SecretaryModeSettings } from "@/components/settings/secretary-mode-settings";

export default function SecretarySettingsPage() {
  return (
    <AtlasAppShell active="settings" width="default">
      <SecretaryModeSettings />
    </AtlasAppShell>
  );
}
