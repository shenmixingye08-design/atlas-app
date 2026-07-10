import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { LoadingState } from "@/components/ui/loading-state";
import { GoogleCalendarPanel } from "@/components/workspace/google-calendar-panel";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.calendar,
  description: ui.calendar.subtitle,
};

export default function WorkspaceCalendarPage() {
  return (
    <AtlasAppShell active="workspace" width="default">
      <Suspense fallback={<LoadingState />}>
        <GoogleCalendarPanel />
      </Suspense>
    </AtlasAppShell>
  );
}
