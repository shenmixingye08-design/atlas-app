import { OwnerNav } from "@/components/owner/owner-nav";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerNotificationList } from "@/components/owner/owner-notification-list";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { ui } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function OwnerNotificationsPage() {
  await requireAtlasOwner();

  return (
    <OwnerShell>
      <div className="space-y-6">
        <OwnerNav active="notifications" />
        <header>
          <h1 className="text-2xl font-semibold text-foreground">
            {ui.notifications.ownerTitle}
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {ui.notifications.ownerSubtitle}
          </p>
          <p className="mt-2 text-sm text-[var(--warning)]">
            {ui.notifications.ownerLocalCacheNotice}
          </p>
        </header>
        <OwnerNotificationList />
      </div>
    </OwnerShell>
  );
}
