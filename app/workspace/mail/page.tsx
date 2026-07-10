import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LoadingState } from "@/components/ui/loading-state";
import { GoogleMailPanel } from "@/components/workspace/google-mail-panel";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.gmail,
  description: ui.gmail.subtitle,
};

export default function WorkspaceMailPage() {
  return (
    <AtlasAppShell active="workspace" width="default">
      <Suspense fallback={<LoadingState />}>
        <GoogleMailPanel />
      </Suspense>
    </AtlasAppShell>
  );
}
