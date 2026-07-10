import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { ConnectionsDashboard } from "@/components/connections/connections-dashboard";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.connections,
  description: ui.connections.subtitle,
};

export default function ConnectionsPage() {
  return (
    <AtlasAppShell active="connections" width="wide">
      <Suspense fallback={<LoadingState />}>
        <ConnectionsDashboard />
      </Suspense>
    </AtlasAppShell>
  );
}
