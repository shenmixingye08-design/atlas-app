"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { OnboardingSettings } from "@/components/settings/onboarding-settings";
import { WorkProfileSettings } from "@/components/settings/work-profile-settings";
import { ThemeSettings } from "@/components/settings/theme-settings";
import { SettingsAccountLink } from "@/components/settings/settings-account-link";
import { SettingsBillingLink } from "@/components/settings/settings-billing-link";
import { SettingsNotificationsLink } from "@/components/settings/settings-notifications-link";
import { ExternalServiceSettings } from "@/components/settings/external-service-settings";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

function SettingsContent() {
  const router = useRouter();

  return (
    <div className="space-y-8 animate-fade-up">
      <header className="space-y-3">
        <p className="text-caption">{ui.brand}</p>
        <h1 className="text-display text-foreground">設定</h1>
        <p className="text-body max-w-2xl text-[var(--text-secondary)]">
          見た目・お知らせ・お支払い・連携だけを整えます。難しい用語は使いません。
        </p>
      </header>
      <ThemeSettings />
      <OnboardingSettings onRedo={() => router.push("/projects?welcome=1")} />
      <WorkProfileSettings />
      <SettingsNotificationsLink />
      <SettingsBillingLink />
      <SettingsAccountLink />
      <Suspense fallback={<LoadingState message="準備しています…" />}>
        <ExternalServiceSettings />
      </Suspense>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AtlasAppShell active="settings" width="default">
      <SettingsContent />
    </AtlasAppShell>
  );
}
