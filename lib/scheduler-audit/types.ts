/**
 * Scheduler Production Audit (Phase 2-1) — shared types.
 * Audit-only: no scheduler behavior changes.
 */

export type SotKind =
  | "durable_db"
  | "process_memory"
  | "local_file"
  | "browser"
  | "mixed"
  | "undefined";

export type RiskSeverity = "P0" | "P1" | "P2";

export type ExecutionEnvironment =
  | "vercel_production"
  | "vercel_preview"
  | "vercel_any"
  | "github_actions"
  | "in_process"
  | "browser_client"
  | "manual";

export type SchedulerEntryPoint = {
  id: string;
  file: string;
  route: string | null;
  functionName: string;
  caller: string;
  executionEnvironment: ExecutionEnvironment;
  frequency: string;
  authentication: string;
  dbAccess: boolean;
  queueAccess: boolean;
  createsRun: boolean;
  createsJob: boolean;
  productionReachable: boolean | "unconfirmed";
  previewReachable: boolean | "unconfirmed";
  duplicateRisk: string;
  missedRunRisk: string;
  notes: string;
};

export type CronDefinition = {
  id: string;
  sourceFile: string;
  activeInRepo: boolean;
  path: string;
  schedule: string;
  httpMethod: string;
  secretUsage: string;
  productionOnly: string;
  previewBehavior: string;
  retryBehavior: string;
  failureHandling: string;
  measuredEvidence: string;
  notes: string;
};

export type SecretAuditRow = {
  key: string;
  required: boolean;
  buildTime: boolean;
  runtime: boolean;
  missingBehavior: string;
  misconfiguredBehavior: string;
  logExposure: string;
  rotatable: boolean;
  productionConfiguredConfirmable: string;
  notes: string;
};

export type NextRunAtPath = {
  id: string;
  triggerCase: string;
  functionName: string;
  file: string;
  timezoneSource: string;
  clientOrServer: "server" | "client" | "mixed";
  persistsToDb: boolean;
  notes: string;
};

export type SotRow = {
  state: string;
  sot: SotKind;
  detail: string;
};

export type RiskRegisterItem = {
  id: string;
  severity: RiskSeverity;
  title: string;
  category:
    | "auth"
    | "miss"
    | "duplicate"
    | "nextRunAt"
    | "health"
    | "secrets"
    | "preview_prod"
    | "dst"
    | "recovery"
    | "evidence"
    | "sot";
  currentBehavior: string;
  requiredFix: string;
  phase22Candidate: boolean;
};

export type SchedulerAuditSnapshot = {
  phase: "2-1";
  generatedAt: string;
  gitCommitHint: string;
  verdict: {
    phasePass: boolean;
    schedulerFullyMapped: boolean;
    minuteProductionProven: boolean;
    rationale: string[];
  };
  entryPoints: SchedulerEntryPoint[];
  crons: CronDefinition[];
  secrets: SecretAuditRow[];
  nextRunAtPaths: NextRunAtPath[];
  sot: SotRow[];
  risks: RiskRegisterItem[];
  healthInventory: Record<string, "implemented" | "partial" | "unimplemented">;
  productionEvidence: {
    liveVercelCronHundredRuns: false;
    inProcessHundredProofExists: boolean;
    evidenceLocation: string;
    note: string;
  };
  unconfirmed: string[];
};
