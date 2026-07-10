import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerNotificationList } from "@/components/owner/owner-notification-list";
import { ui } from "@/lib/i18n";

export default function OwnerNotificationsPage() {
  return (
    <OwnerShell>
      <div className="space-y-6">
        <OwnerNav active="notifications" />
        <header>
          <h1 className="text-2xl font-semibold text-foreground">
            {ui.notifications.ownerTitle}
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{ui.notifications.ownerSubtitle}</p>
        </header>
        <OwnerNotificationList />
      </div>
    </OwnerShell>
  );
}
