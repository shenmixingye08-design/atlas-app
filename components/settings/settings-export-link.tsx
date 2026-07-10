import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";

export function SettingsExportLink() {
  return (
    <section aria-labelledby="export-link-heading">
      <Link
        href="/settings/export"
        className="block focus-ring rounded-[var(--radius-xl)]"
      >
        <Card
          padding="lg"
          variant="interactive"
          className="shadow-[var(--shadow-soft)]"
        >
          <h2 id="export-link-heading" className="text-title text-foreground">
            {ui.dataExport.settingsLinkTitle}
          </h2>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.dataExport.settingsLinkHint}
          </p>
        </Card>
      </Link>
    </section>
  );
}
