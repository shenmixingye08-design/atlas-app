import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { BillingSettings } from "@/components/settings/billing-settings";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

export default function BillingSettingsPage() {
  return (
    <AtlasAppShell active="billing" width="default">
      <div className="space-y-8 animate-fade-up">
        <header className="space-y-3">
          <p className="text-caption">{ui.brand}</p>
          <h1 className="text-display text-foreground">{ui.billing.pageTitle}</h1>
          <p className="text-body max-w-2xl">{ui.billing.pageSubtitle}</p>
        </header>
        <Suspense fallback={<LoadingState message={ui.billing.loadingPlans} />}>
          <BillingSettings />
        </Suspense>
      </div>
    </AtlasAppShell>
  );
}
