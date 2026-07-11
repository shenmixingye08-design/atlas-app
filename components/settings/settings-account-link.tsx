import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";

/** Hub card for account management (plan, export, withdrawal, purge). */
export function SettingsAccountLink() {
  return (
    <section aria-labelledby="account-management-heading">
      <Link
        href="/settings/account"
        className="block focus-ring rounded-[var(--radius-xl)]"
      >
        <Card
          padding="lg"
          variant="interactive"
          className="shadow-[var(--shadow-soft)]"
        >
          <h2
            id="account-management-heading"
            className="text-title text-foreground"
          >
            {ui.accountManagement.settingsLinkTitle}
          </h2>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.accountManagement.settingsLinkHint}
          </p>
        </Card>
      </Link>
    </section>
  );
}
