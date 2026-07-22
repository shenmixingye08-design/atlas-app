import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { CommanderDashboard } from "@/components/commander/commander-dashboard";
import { LoadingState } from "@/components/ui/loading-state";

export default function CommanderClientPage() {
  return (
    <AtlasAppShell active="commander" width="default">
      <Suspense fallback={<LoadingState />}>
        <CommanderDashboard />
      </Suspense>
    </AtlasAppShell>
  );
}
