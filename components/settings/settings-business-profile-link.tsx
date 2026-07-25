import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";

/** Hub card — 設定一覧の上部に置き、モバイルでも最初に見える導線。 */
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
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--surface-muted)] text-xl"
            >
              🏢
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id="business-profile-link-heading"
                className="text-title text-foreground"
              >
                {ui.businessProfile.settingsLinkTitle}
              </h2>
              <p className="mt-1 text-caption text-[var(--foreground-muted)]">
                {ui.businessProfile.settingsLinkHint}
              </p>
            </div>
            <span
              aria-hidden
              className="mt-1 shrink-0 text-lg text-[var(--foreground-muted)]"
            >
              ›
            </span>
          </div>
        </Card>
      </Link>
    </section>
  );
}
