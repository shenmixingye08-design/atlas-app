import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";

export function SettingsMemoryLink() {
  return (
    <section aria-labelledby="memory-link-heading">
      <Link
        href="/settings/memory"
        className="block focus-ring rounded-[var(--radius-xl)]"
      >
        <Card
          padding="lg"
          variant="interactive"
          className="shadow-[var(--shadow-soft)]"
        >
          <h2 id="memory-link-heading" className="text-title text-foreground">
            {ui.memory.settingsLinkTitle}
          </h2>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.memory.settingsLinkHint}
          </p>
        </Card>
      </Link>
    </section>
  );
}
