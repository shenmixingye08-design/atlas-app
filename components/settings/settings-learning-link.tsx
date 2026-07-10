import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";

export function SettingsLearningLink() {
  return (
    <section aria-labelledby="learning-link-heading">
      <Link
        href="/settings/learning"
        className="block focus-ring rounded-[var(--radius-xl)]"
      >
        <Card
          padding="lg"
          variant="interactive"
          className="shadow-[var(--shadow-soft)]"
        >
          <h2 id="learning-link-heading" className="text-title text-foreground">
            {ui.learningEngine.settingsLinkTitle}
          </h2>
          <p className="mt-1 text-caption text-[var(--foreground-muted)]">
            {ui.learningEngine.settingsLinkHint}
          </p>
        </Card>
      </Link>
    </section>
  );
}
