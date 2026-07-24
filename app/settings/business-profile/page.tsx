import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { BusinessProfileSettings } from "@/components/settings/business-profile-settings";

export default function BusinessProfileSettingsPage() {
  return (
    <AtlasAppShell active="settings" width="wide">
      <BusinessProfileSettings />
    </AtlasAppShell>
  );
}
