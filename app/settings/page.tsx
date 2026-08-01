"use client";

import { Suspense } from "react";

import { BetaFeedbackForm } from "@/components/beta/beta-feedback-form";
import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { SettingsAccountLink } from "@/components/settings/settings-account-link";
import { SettingsAccountRequestsLink } from "@/components/settings/settings-account-requests-link";
import { SettingsBillingLink } from "@/components/settings/settings-billing-link";
import { SettingsNotificationsLink } from "@/components/settings/settings-notifications-link";
import { ExternalServiceSettings } from "@/components/settings/external-service-settings";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

function SettingsContent() {
  return (
    <div className="space-y-8 animate-fade-up">
      <header className="space-y-3">
        <p className="text-caption">{ui.brand}</p>
        <h1 className="text-display text-foreground">設定</h1>
        <p className="text-body max-w-2xl text-[var(--text-secondary)]">
          お知らせ・連携・お支払い・アカウント・データの削除だけを管理します。
        </p>
      </header>
      <SettingsNotificationsLink />
      <Suspense fallback={<LoadingState message="準備しています…" />}>
        <ExternalServiceSettings />
      </Suspense>
      <SettingsBillingLink />
      <SettingsAccountLink />
      <SettingsAccountRequestsLink />
      <BetaFeedbackForm />
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
