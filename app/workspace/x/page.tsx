import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LoadingState } from "@/components/ui/loading-state";
import { XAutoPostPanel } from "@/components/workspace/x-autopost-panel";
import { XPostPanel } from "@/components/workspace/x-post-panel";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.xPost,
  description: ui.xPost.subtitle,
};

export default function WorkspaceXPage() {
  return (
    <AtlasAppShell active="workspace" width="default">
      <Suspense fallback={<LoadingState />}>
        <div className="space-y-14">
          <XAutoPostPanel />
          <div className="border-t border-[var(--border-subtle)] pt-10">
            <XPostPanel />
          </div>
        </div>
      </Suspense>
    </AtlasAppShell>
  );
}
