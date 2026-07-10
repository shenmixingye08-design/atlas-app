import type { Metadata } from "next";
import { Suspense } from "react";

import { AutomationsDashboard } from "@/components/automations/automations-dashboard";
import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.automations,
  description: ui.entrustedJobs.pageDescription,
};

export default function AutomationsPage() {
  return (
    <AtlasAppShell active="automations" width="wide">
      <Suspense fallback={<LoadingState />}>
        <AutomationsDashboard />
      </Suspense>
    </AtlasAppShell>
  );
}
