import { Suspense } from "react";

import { RunListPage } from "@/components/automations/v2/run-list-page";
import { LoadingState } from "@/components/ui/loading-state";

export default function AutomationsRunsPage() {
  return (
    <Suspense fallback={<LoadingState message="実行履歴を準備しています…" />}>
      <RunListPage />
    </Suspense>
  );
}
