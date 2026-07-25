import { notFound } from "next/navigation";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { SettingsBusinessProfileLink } from "@/components/settings/settings-business-profile-link";
import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";

/**
 * DEV-ONLY visual proof of the settings hub entry for 業務プロフィール.
 * Returns 404 in production builds (including Vercel Preview NODE_ENV=production).
 */
export const dynamic = "force-static";

export default function DevBusinessProfilePreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <AtlasAppShell active="settings" width="default">
      <div className="space-y-8 animate-fade-up">
        <header className="space-y-3">
          <p className="text-caption">{ui.brand}</p>
          <h1 className="text-display text-foreground">{ui.workProfile.pageTitle}</h1>
          <p className="text-body max-w-2xl">{ui.workProfile.pageSubtitle}</p>
        </header>
        <SettingsBusinessProfileLink />
        <Card padding="lg" className="shadow-[var(--shadow-soft)]">
          <p className="text-caption">
            ← {ui.businessProfile.backToSettings}
          </p>
          <h2 className="mt-3 text-title text-foreground">
            {ui.businessProfile.title}
          </h2>
          <p className="mt-1 text-body text-[var(--foreground-muted)]">
            {ui.businessProfile.subtitle}
          </p>
        </Card>
      </div>
    </AtlasAppShell>
  );
}
