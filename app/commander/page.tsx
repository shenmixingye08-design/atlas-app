import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { CommanderDashboard } from "@/components/commander/commander-dashboard";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.commander,
  description: "AIオーケストレーター — 一回の依頼で分類から完了報告まで自動実行",
};

export default function CommanderPage() {
  return (
    <AtlasAppShell active="automations" width="default">
      <Suspense fallback={<LoadingState />}>
        <CommanderDashboard />
      </Suspense>
    </AtlasAppShell>
  );
}
