import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";

export function SettingsBusinessProfileLink() {
  return (
    <section aria-labelledby="business-profile-link-heading">
      <Link
        href="/settings/business-profile"
        className="block min-h-[44px] rounded-[var(--radius-xl)] focus-ring"
      >
        <Card
          padding="lg"
          variant="interactive"
          className="shadow-[var(--shadow-soft)]"
        >
          <h2
            id="business-profile-link-heading"
            className="text-title text-foreground"
          >
            {ui.businessProfile.settingsLinkTitle}
          </h2>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.businessProfile.settingsLinkHint}
          </p>
        </Card>
      </Link>
    </section>
  );
}
