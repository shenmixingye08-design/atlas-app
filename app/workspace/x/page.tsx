import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LoadingState } from "@/components/ui/loading-state";
import { XAutoPostPanel } from "@/components/workspace/x-autopost-panel";
import { XManualPostSection } from "@/components/workspace/x-manual-post-section";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.xPost,
  description: ui.xPost.subtitle,
};

export default function WorkspaceXPage() {
  return (
    <AtlasAppShell active="x-autopost" width="default">
      <Suspense fallback={<LoadingState />}>
        <div className="space-y-8">
          <XAutoPostPanel />
          <XManualPostSection />
        </div>
      </Suspense>
    </AtlasAppShell>
  );
}
