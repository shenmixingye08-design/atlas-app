"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { submitCommanderRequest } from "@/lib/commander/client";
import { projectService } from "@/lib/projects/project-service";

/**
 * Re-run the exact same request through the existing pipeline ("作り直す").
 *
 * Reuses the Commander path (no new AI infrastructure) and lands the user on
 * the freshly produced result. When the re-run needs confirmation it hands off
 * to the run screen with the request prefilled rather than silently stalling.
 */
export function useRegenerate(workRequest: string) {
  const router = useRouter();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = useCallback(async () => {
    const trimmed = (workRequest ?? "").trim();
    if (!trimmed || isRegenerating) return;

    setIsRegenerating(true);
    setError(null);

    try {
      const result = await submitCommanderRequest(trimmed, { mode: "execute" });

      if (
        result.result &&
        (result.status === "completed" || result.status === "partial")
      ) {
        const project = projectService.saveFromOrchestration(
          trimmed,
          result.result,
          result.runId ? `commander-${result.runId}` : undefined,
        );
        router.push(`/projects/${project.id}`);
        return;
      }

      if (result.status === "awaiting_confirmation") {
        router.push(`/workspace?assignment=${encodeURIComponent(trimmed)}`);
        return;
      }

      setError(result.report?.summary ?? "作り直しに失敗しました。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "作り直しに失敗しました。");
    } finally {
      setIsRegenerating(false);
    }
  }, [workRequest, isRegenerating, router]);

  return { regenerate, isRegenerating, error };
}
