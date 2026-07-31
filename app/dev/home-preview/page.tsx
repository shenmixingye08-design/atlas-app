import { notFound } from "next/navigation";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { SecretaryHomeDashboard } from "@/components/home/secretary-home-dashboard";

/**
 * Dev-only Phase1 home preview (no auth).
 */
export default function DevHomePreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <AtlasAppShell active="projects" width="wide" chrome="focus">
      <SecretaryHomeDashboard />
    </AtlasAppShell>
  );
}
