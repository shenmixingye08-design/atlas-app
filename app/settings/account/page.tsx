import { AccountSettings } from "@/components/settings/account-settings";
import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { ui } from "@/lib/i18n";

export default function SettingsAccountPage() {
  return (
    <AtlasAppShell active="settings" width="default">
      <div className="space-y-8 animate-fade-up">
        <header className="space-y-3">
          <p className="text-caption">{ui.brand}</p>
          <h1 className="text-display text-foreground">
            {ui.accountManagement.pageTitle}
          </h1>
          <p className="text-body max-w-2xl">
            {ui.accountManagement.pageSubtitle}
          </p>
        </header>
        <AccountSettings />
      </div>
    </AtlasAppShell>
  );
}
