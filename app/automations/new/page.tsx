import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { AutomationWizard } from "@/components/automations/automation-wizard";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.phase3.wizardTitle,
  description: ui.phase3.wizardSubtitle,
};

export default function NewAutomationPage() {
  return (
    <AtlasAppShell active="automations" width="narrow">
      <Suspense fallback={<LoadingState />}>
        <AutomationWizard />
      </Suspense>
    </AtlasAppShell>
  );
}
