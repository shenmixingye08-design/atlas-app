import type { Metadata } from "next";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { ProjectDetailView } from "@/components/projects/project-detail-view";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.projects,
  description: "プロジェクトのワークフローと成果物",
};

type ProjectDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { id } = await params;

  return (
    <AtlasAppShell active="projects" width="default">
      <ProjectDetailView projectId={id} />
    </AtlasAppShell>
  );
}
