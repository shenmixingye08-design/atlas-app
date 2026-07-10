import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { WorkspaceDashboard } from "@/components/workspace/workspace-dashboard";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.workspace,
  description: "AI秘書へ仕事を依頼する",
};

export default function WorkspacePage() {
  return (
    <AtlasAppShell active="workspace" width="default">
      <Suspense fallback={<LoadingState />}>
        <WorkspaceDashboard />
      </Suspense>
    </AtlasAppShell>
  );
}
