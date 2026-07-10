import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { ui } from "@/lib/i18n";

export default function NotificationSettingsPage() {
  return (
    <AtlasAppShell active="settings" width="default">
      <div className="space-y-8 animate-fade-up">
        <header className="space-y-3">
          <p className="text-caption">{ui.brand}</p>
          <h1 className="text-display text-foreground">{ui.notifications.settingsPageTitle}</h1>
          <p className="text-body max-w-2xl text-[var(--foreground-muted)]">
            {ui.notifications.settingsPageSubtitle}
          </p>
        </header>
        <NotificationSettings />
      </div>
    </AtlasAppShell>
  );
}
