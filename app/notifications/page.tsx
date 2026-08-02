import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { NotificationInbox } from "@/components/automation-first/notification-inbox";

export default function NotificationsPage() {
  return (
    <AtlasAppShell active="notifications" width="wide">
      <NotificationInbox />
    </AtlasAppShell>
  );
}
