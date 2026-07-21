import type { Metadata } from "next";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { WorkProgressLogPage } from "@/components/work-progress/work-progress-log-page";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: `${ui.workProgress.logHeading} — MINERVOT`,
  description: "AIがいましていることを確認できます",
};

export default function WorkProgressPage() {
  return (
    <AtlasAppShell active="workspace" width="default">
      <WorkProgressLogPage />
    </AtlasAppShell>
  );
}
