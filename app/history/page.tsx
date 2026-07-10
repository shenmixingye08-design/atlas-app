import type { Metadata } from "next";
import { Suspense } from "react";

import { ActivityHistoryPageContent } from "@/components/activity-history/activity-history-page";
import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.activityHistory.metaTitle,
};

export default function HistoryPage() {
  return (
    <AtlasAppShell active="history" width="default">
      <Suspense fallback={<LoadingState message={ui.activityHistory.loading} />}>
        <ActivityHistoryPageContent />
      </Suspense>
    </AtlasAppShell>
  );
}
