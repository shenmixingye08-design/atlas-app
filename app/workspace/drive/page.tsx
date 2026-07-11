import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LoadingState } from "@/components/ui/loading-state";
import { CloudStoragePanel } from "@/components/workspace/cloud-storage-panel";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.drive,
  description: ui.cloudStorage.subtitle,
};

export default function WorkspaceDrivePage() {
  return (
    <AtlasAppShell active="workspace" width="default">
      <Suspense fallback={<LoadingState />}>
        <CloudStoragePanel />
      </Suspense>
    </AtlasAppShell>
  );
}
