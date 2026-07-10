import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";

export function SettingsWorkMemoryLink() {
  return (
    <section aria-labelledby="work-memory-link-heading">
      <Link
        href="/settings/work-memory"
        className="block focus-ring rounded-[var(--radius-xl)]"
      >
        <Card
          padding="lg"
          variant="interactive"
          className="shadow-[var(--shadow-soft)]"
        >
          <h2 id="work-memory-link-heading" className="text-title text-foreground">
            {ui.workMemory.settingsLinkTitle}
          </h2>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.workMemory.settingsLinkHint}
          </p>
        </Card>
      </Link>
    </section>
  );
}
