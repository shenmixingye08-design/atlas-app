import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { IntegrationsDashboard } from "@/components/integrations/integrations-dashboard";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.integrations,
  description: "外部サービスとの接続を管理し、成果物を配信",
};

export default function IntegrationsPage() {
  return (
    <AtlasAppShell active="integrations" width="wide">
      <Suspense fallback={<LoadingState />}>
        <IntegrationsDashboard />
      </Suspense>
    </AtlasAppShell>
  );
}
