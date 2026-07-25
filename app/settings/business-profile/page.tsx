import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { BusinessProfileSettings } from "@/components/settings/business-profile-settings";

export default function BusinessProfileSettingsPage() {
  return (
    <AtlasAppShell active="business-profile" width="wide">
      <BusinessProfileSettings />
    </AtlasAppShell>
  );
}
