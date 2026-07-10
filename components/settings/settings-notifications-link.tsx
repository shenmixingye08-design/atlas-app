import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";

export function SettingsNotificationsLink() {
  return (
    <section aria-labelledby="notifications-link-heading">
      <Link
        href="/settings/notifications"
        className="block focus-ring rounded-[var(--radius-xl)]"
      >
        <Card
          padding="lg"
          variant="interactive"
          className="shadow-[var(--shadow-soft)]"
        >
          <h2 id="notifications-link-heading" className="text-title text-foreground">
            {ui.notifications.settingsLinkTitle}
          </h2>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.notifications.settingsLinkHint}
          </p>
        </Card>
      </Link>
    </section>
  );
}
