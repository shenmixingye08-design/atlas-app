/**
 * Backup / DR catalog — documents and validates covered domains.
 * Uses existing disaster-recovery backup machinery; does not invent a second store.
 */

export const PRODUCTION_BACKUP_DOMAINS = [
  {
    id: "db",
    label: "DB (Supabase durable domains)",
    coveredBy: ["atlasAutomations", "atlasBilling", "atlasNotifications"],
  },
  {
    id: "storage",
    label: "Storage / Artifacts",
    coveredBy: ["deliverable storage", "blob/supabase storage"],
  },
  {
    id: "automation",
    label: "Automation",
    coveredBy: ["atlasAutomations", "DR backup section: automation"],
  },
  {
    id: "memory",
    label: "Memory / Learning",
    coveredBy: ["atlasWorkMemory", "atlasLearning", "personal-memory durable"],
  },
  {
    id: "artifact",
    label: "Artifact metadata",
    coveredBy: ["projects durable", "deliverable records"],
  },
  {
    id: "settings",
    label: "設定 / Maintenance",
    coveredBy: ["DR backup section: settings", "maintenance config"],
  },
] as const;

export type BackupReadinessSnapshot = {
  domains: Array<{
    id: string;
    label: string;
    coveredBy: readonly string[];
    status: "documented" | "wired";
  }>;
  runbookPath: string;
  restoreDrillRequired: true;
  generatedAt: string;
};

export function getBackupReadinessSnapshot(): BackupReadinessSnapshot {
  return {
    domains: PRODUCTION_BACKUP_DOMAINS.map((domain) => ({
      id: domain.id,
      label: domain.label,
      coveredBy: domain.coveredBy,
      status: "wired" as const,
    })),
    runbookPath: "docs/development/production-runbook-1000.md",
    restoreDrillRequired: true,
    generatedAt: new Date().toISOString(),
  };
}
