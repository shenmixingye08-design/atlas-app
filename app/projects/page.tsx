import type { Metadata } from "next";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { ProjectsDashboard } from "@/components/projects/projects-dashboard";
import { LoadingState } from "@/components/ui/loading-state";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.home,
  description: ui.home.welcomeHeadline,
};

export default function ProjectsPage() {
  return (
    <AtlasAppShell active="projects" width="wide">
      <Suspense fallback={<LoadingState message={ui.loading} />}>
        <ProjectsDashboard />
      </Suspense>
    </AtlasAppShell>
  );
}
