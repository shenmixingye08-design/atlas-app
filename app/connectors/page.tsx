import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { ConnectorsDashboard } from "@/components/connectors/connectors-dashboard";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.connectors,
  description: ui.connectors.subtitle,
};

export default function ConnectorsPage() {
  return (
    <AtlasAppShell active="connectors" width="wide">
      <Suspense fallback={<LoadingState />}>
        <ConnectorsDashboard />
      </Suspense>
    </AtlasAppShell>
  );
}
