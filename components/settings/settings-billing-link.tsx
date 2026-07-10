import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";

export function SettingsBillingLink() {
  return (
    <section aria-labelledby="billing-link-heading">
      <Link href="/settings/billing" className="block focus-ring rounded-[var(--radius-xl)]">
        <Card
          padding="lg"
          variant="interactive"
          className="shadow-[var(--shadow-soft)]"
        >
          <h2 id="billing-link-heading" className="text-title text-foreground">
            {ui.billing.settingsLinkTitle}
          </h2>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.billing.settingsLinkHint}
          </p>
        </Card>
      </Link>
    </section>
  );
}
