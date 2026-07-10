"use client";

import { useEffect } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { HomeWorkLoadError } from "@/components/home/home-dashboard-error-boundary";

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/projects]", error);
  }, [error]);

  return (
    <AtlasAppShell active="projects" width="wide">
      <HomeWorkLoadError onRetry={reset} />
    </AtlasAppShell>
  );
}
