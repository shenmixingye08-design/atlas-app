import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";

/** Points users to the contact form for account deletion / data deletion requests. */
export function SettingsAccountRequestsLink() {
  return (
    <section aria-labelledby="account-requests-heading" className="space-y-3">
      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        <h2 id="account-requests-heading" className="text-title text-foreground">
          {ui.workProfile.accountRequestsTitle}
        </h2>
        <p className="mt-1 text-caption text-[var(--foreground-muted)]">
          {ui.workProfile.accountRequestsHint}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/contact?category=account_deletion"
            className="text-sm font-medium text-accent underline-offset-2 hover:underline"
          >
            {ui.workProfile.accountDeletionLink}
          </Link>
          <Link
            href="/contact?category=data_deletion"
            className="text-sm font-medium text-accent underline-offset-2 hover:underline"
          >
            {ui.workProfile.dataDeletionLink}
          </Link>
        </div>
      </Card>
    </section>
  );
}
