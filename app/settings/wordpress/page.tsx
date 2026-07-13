import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { WordPressConnectionSettings } from "@/components/settings/wordpress-connection-settings";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.wordpressSettings,
  description: ui.wordpressSettings.subtitle,
};

export default function WordPressSettingsPage() {
  return (
    <AtlasAppShell active="settings" width="default">
      <div className="space-y-8 animate-fade-in">
        <header className="space-y-3">
          <p className="text-caption">{ui.brand}</p>
          <h1 className="text-display text-foreground">
            {ui.wordpressSettings.title}
          </h1>
          <p className="max-w-2xl text-body text-[var(--foreground-muted)]">
            {ui.wordpressSettings.subtitle}
          </p>
        </header>
        <Suspense fallback={<LoadingState message={ui.loading} />}>
          <WordPressConnectionSettings />
        </Suspense>
      </div>
    </AtlasAppShell>
  );
}
