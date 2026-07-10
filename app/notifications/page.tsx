import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { NotificationList } from "@/components/notifications/notification-list";
import { ui } from "@/lib/i18n";

export default function NotificationsPage() {
  return (
    <AtlasAppShell active="projects" width="wide">
      <div className="space-y-8 animate-fade-up">
        <header className="space-y-3">
          <p className="text-caption text-accent">{ui.brand}</p>
          <h1 className="text-display text-foreground">{ui.notifications.title}</h1>
          <p className="text-body max-w-2xl text-[var(--text-secondary)]">
            {ui.notifications.pageSubtitle}
          </p>
        </header>
        <NotificationList />
      </div>
    </AtlasAppShell>
  );
}
