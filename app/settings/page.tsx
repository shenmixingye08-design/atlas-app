"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { OnboardingSettings } from "@/components/settings/onboarding-settings";
import { WorkProfileSettings } from "@/components/settings/work-profile-settings";
import { ThemeSettings } from "@/components/settings/theme-settings";
import { CostOptimizationSettings } from "@/components/settings/cost-optimization-settings";
import { SettingsAccountLink } from "@/components/settings/settings-account-link";
import { SettingsAccountRequestsLink } from "@/components/settings/settings-account-requests-link";
import { SettingsBillingLink } from "@/components/settings/settings-billing-link";
import { SettingsExportLink } from "@/components/settings/settings-export-link";
import { SettingsBusinessProfileLink } from "@/components/settings/settings-business-profile-link";
import { SettingsMemoryLink } from "@/components/settings/settings-memory-link";
import { SettingsWorkMemoryLink } from "@/components/settings/settings-work-memory-link";
import { SettingsLearningLink } from "@/components/settings/settings-learning-link";
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
        <h1 className="text-display text-foreground">{ui.workProfile.pageTitle}</h1>
        <p className="text-body max-w-2xl">{ui.workProfile.pageSubtitle}</p>
      </header>
      <ThemeSettings />
      <OnboardingSettings onRedo={() => router.push("/projects?welcome=1")} />
      <WorkProfileSettings />
      <SettingsBusinessProfileLink />
      <SettingsWorkMemoryLink />
      <SettingsLearningLink />
      <SettingsMemoryLink />
      <SettingsExportLink />
      <SettingsAccountLink />
      <SettingsAccountRequestsLink />
      <SettingsBillingLink />
      <SettingsNotificationsLink />
      <CostOptimizationSettings />
      <Suspense fallback={<LoadingState message={ui.loading} />}>
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
