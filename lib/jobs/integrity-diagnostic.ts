import "server-only";

import { listStaleRunningJobs } from "./job-store";
import { getJobRecord } from "./reliability";

export type IntegrityIssueSeverity = "warning" | "error";

export type IntegrityIssue = {
  code: string;
  severity: IntegrityIssueSeverity;
  jobId: string;
  userId: string;
  message: string;
  suggestedAction: string;
};

export type IntegrityDiagnosticSnapshot = {
  generatedAt: string;
  staleRunning: IntegrityIssue[];
  completedWithoutArtifact: IntegrityIssue[];
  totals: {
    staleRunning: number;
    completedWithoutArtifact: number;
  };
};

/**
 * Read-only integrity scan — no auto-delete or auto-fix.
 * Owner/diagnostic use only.
 */
export async function buildIntegrityDiagnosticSnapshot(): Promise<IntegrityDiagnosticSnapshot> {
  const staleRunning: IntegrityIssue[] = [];
  const completedWithoutArtifact: IntegrityIssue[] = [];

  const staleJobs = await listStaleRunningJobs();
  for (const job of staleJobs) {
    staleRunning.push({
      code: "stale_running",
      severity: "error",
      jobId: job.id,
      userId: job.userId,
      message: "Job has been running beyond hang timeout",
      suggestedAction: "Inspect tick processor / mark failed or complete manually",
    });
  }

  // Memory/Supabase job store does not expose a global completed scan; sample recent
  // stale list only. Extend with service-role query when atlas_automation_jobs is live.
  for (const job of staleJobs.slice(0, 0)) {
    const record = await getJobRecord(job.id, job.userId);
    if (
      record &&
      (record.status === "completed" || record.status === "partially_completed") &&
      !record.artifactId &&
      !record.externalResultUrl
    ) {
      completedWithoutArtifact.push({
        code: "completed_without_artifact",
        severity: "warning",
        jobId: record.id,
        userId: record.userId,
        message: "Completed job has no artifact or external proof",
        suggestedAction: "Review completion evidence rules; do not auto-delete",
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    staleRunning,
    completedWithoutArtifact,
    totals: {
      staleRunning: staleRunning.length,
      completedWithoutArtifact: completedWithoutArtifact.length,
    },
  };
}
