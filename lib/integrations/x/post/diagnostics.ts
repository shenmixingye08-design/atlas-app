import { randomUUID } from "node:crypto";

export type XPostFailedStage =
  | "connection"
  | "oauth"
  | "scope"
  | "validation"
  | "approval"
  | "provider"
  | "completion_gate"
  | "scheduler"
  | "worker"
  | "unknown";

export type XPostDiagnostic = {
  automationId: string | null;
  occurrenceId: string | null;
  runId: string | null;
  jobId: string | null;
  diagnosticId: string;
  userId: string;
  externalService: "x";
  failedStage: XPostFailedStage | null;
  developerCode: string | null;
  providerStatus: number | null;
  retryCount: number | null;
  retryReason: string | null;
  externalActionId: string | null;
  xAccountId: string | null;
};

const SECRET_KEY_PATTERN =
  /token|secret|authorization|password|refresh|bearer|cookie/i;

function omitSecrets(
  extra: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!extra) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra)) {
    if (SECRET_KEY_PATTERN.test(key) && !/fingerprint$/i.test(key)) continue;
    if (typeof value === "string" && /bearer\s+[a-z0-9._-]+/i.test(value)) {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

export function createXPostDiagnosticId(): string {
  return `xdiag_${randomUUID().slice(0, 12)}`;
}

export function buildXPostDiagnostic(input: {
  userId: string;
  automationId?: string | null;
  occurrenceId?: string | null;
  runId?: string | null;
  jobId?: string | null;
  diagnosticId?: string | null;
  failedStage?: XPostFailedStage | null;
  developerCode?: string | null;
  providerStatus?: number | null;
  retryCount?: number | null;
  retryReason?: string | null;
  externalActionId?: string | null;
  xAccountId?: string | null;
}): XPostDiagnostic {
  return {
    automationId: input.automationId ?? null,
    occurrenceId: input.occurrenceId ?? input.runId ?? null,
    runId: input.runId ?? null,
    jobId: input.jobId ?? null,
    diagnosticId: input.diagnosticId?.trim() || createXPostDiagnosticId(),
    userId: input.userId,
    externalService: "x",
    failedStage: input.failedStage ?? null,
    developerCode: input.developerCode ?? null,
    providerStatus: input.providerStatus ?? null,
    retryCount: input.retryCount ?? null,
    retryReason: input.retryReason ?? null,
    externalActionId: input.externalActionId ?? null,
    xAccountId: input.xAccountId ?? null,
  };
}

/** Safe diagnostic log — never includes tokens or secrets. */
export function logXPostDiagnostic(
  diagnostic: XPostDiagnostic,
  extra?: Record<string, unknown>,
): void {
  console.info("[X Post] diagnostic", {
    ...diagnostic,
    ...omitSecrets(extra),
  });
}
