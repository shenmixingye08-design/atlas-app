/**
 * Durable SoT Audit types (Phase 1-1).
 * Audit-only — no runtime SoT migration.
 */

export type SotKind =
  | "db"
  | "process_memory"
  | "file"
  | "browser_storage"
  | "clerk_metadata"
  | "supabase_storage"
  | "mixed"
  | "derived"
  | "undefined";

export type Criticality = "P0" | "P1" | "P2";

export type DurableDomainId =
  | "Automation"
  | "Schedule"
  | "Occurrence"
  | "Run"
  | "Job"
  | "Step"
  | "Lease"
  | "Heartbeat"
  | "Retry"
  | "Recovery"
  | "Artifact"
  | "CompletionEvidence"
  | "Memory"
  | "Notification"
  | "Metrics"
  | "Idempotency"
  | "ExternalAction"
  | "Approval"
  | "FirstExperience"
  | "OAuthConnection"
  | "Lock"
  | "Prediction"
  | "Monitoring"
  | "ResultApi"
  | "SavedMinutes"
  | "DashboardAggregation"
  | "StorageMetadata";

export type DomainSotRecord = {
  domain: DurableDomainId;
  sot: SotKind;
  primaryPaths: string[];
  durableBackend: string | null;
  processMemoryHotPath: string | null;
  fileFallback: string | null;
  browserStorage: string | null;
  mixedDetail: string | null;
  survivesRestart: boolean;
  productionReachable: boolean;
  notes: string[];
};

export type FindingRecord = {
  id: string;
  criticality: Criticality;
  title: string;
  domain: DurableDomainId | "CrossCutting";
  evidence: string[];
  impact:
    | "job_loss"
    | "double_execution"
    | "false_completed"
    | "external_action_duplicate"
    | "evidence_missing"
    | "authz_boundary"
    | "restart_inconsistency"
    | "metrics_loss"
    | "recovery_impossible"
    | "schedule_miss"
    | "memory_loss"
    | "ui_inconsistency"
    | "cache_inconsistency"
    | "noncritical_history_loss";
  restartRisk: boolean;
  multiInstanceRisk: boolean;
  migrationTarget: boolean;
};

export type RestartScenarioId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export type RestartScenarioResult = {
  id: RestartScenarioId;
  title: string;
  codePaths: string[];
  remains: string[];
  lost: string[];
  resumable: boolean;
  doubleExecutionRisk: boolean;
  falseCompletedRisk: boolean;
  currentOutcome: string;
  requiredFix: string;
};

export type MultiInstanceScenario = {
  id: string;
  title: string;
  codePaths: string[];
  processMemoryShared: boolean;
  fileShared: boolean;
  dbShared: boolean;
  raceResult: string;
  requiredFix: string;
};

export type MigrationTarget = {
  domain: DurableDomainId | string;
  currentStorage: SotKind | string;
  targetStorage: string;
  migrationRequired: boolean;
  schemaRequired: boolean;
  repositoryRequired: boolean;
  uniqueConstraintRequired: boolean;
  transactionRequired: boolean;
  ttlRequired: boolean;
  retention: string;
  rollbackDifficulty: "low" | "medium" | "high";
  priority: Criticality;
  rationale: string;
};

export type DurableSotAuditReport = {
  phase: "1-1-durable-sot-audit";
  generatedAt: string;
  domains: DomainSotRecord[];
  findings: FindingRecord[];
  restartScenarios: RestartScenarioResult[];
  multiInstance: MultiInstanceScenario[];
  migrationTargets: MigrationTarget[];
  recommendedOrder: Array<{
    order: number;
    domain: string;
    reason: string;
  }>;
  nextPhase12Targets: string[];
  unconfirmed: string[];
  uncertainties: string[];
};
