import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LoadingState } from "@/components/ui/loading-state";
import { GoogleDrivePanel } from "@/components/workspace/google-drive-panel";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.drive,
  description: ui.drive.subtitle,
};

export default function WorkspaceDrivePage() {
  return (
    <AtlasAppShell active="workspace" width="default">
      <Suspense fallback={<LoadingState />}>
        <GoogleDrivePanel />
      </Suspense>
    </AtlasAppShell>
  );
}
