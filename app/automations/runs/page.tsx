import { Suspense } from "react";

import { RunListPage } from "@/components/automations/v2/run-list-page";
import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LoadingState } from "@/components/ui/loading-state";

export default function AutomationsRunsPage() {
  return (
    <AtlasAppShell active="automations" width="narrow">
      <Suspense fallback={<LoadingState message="実行履歴を準備しています…" />}>
        <RunListPage />
      </Suspense>
    </AtlasAppShell>
  );
}
