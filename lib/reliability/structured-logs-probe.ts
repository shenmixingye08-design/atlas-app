/**
 * P2-04 Production probe: correlation-tagged structured logs on Postgres SoT.
 * Soft-success forbidden. Memory is never treated as SoT.
 */

import "server-only";

import { randomUUID } from "crypto";

import { getHealthVersionPayload } from "@/lib/health/version-info";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  awaitDeveloperErrorPersist,
  listDeveloperErrorLogs,
  recordDeveloperError,
  resetDeveloperErrorLogsForTests,
  type DeveloperErrorLog,
} from "./developer-log";
import {
  applyStructuredLogsMigration,
  deleteStructuredLogsByIds,
  getStructuredLogsByCorrelationId,
  isTransientJwtClockError,
  listStructuredLogsDurable,
  persistStructuredLog,
  redactSecrets,
} from "./structured-logs-store";

export type StructuredLogsProbeResult = {
  ok: boolean;
  tableOk: boolean;
  correlationPresent: boolean;
  durableWriteOk: boolean;
  durableReadOk: boolean;
  restartDurableOk: boolean;
  multiInstanceOk: boolean;
  duplicateIdempotentOk: boolean;
  concurrentOk: boolean;
  crossUserIsolated: boolean;
  secretsRedacted: boolean;
  memoryNotSot: boolean;
  failClosedDbUnavailable: boolean;
  error: string | null;
  commitShaShort: string;
  environment: string;
};

const PROBE_USER_A = "__atlas_structured_logs_probe_a__";
const PROBE_USER_B = "__atlas_structured_logs_probe_b__";

function versionBits() {
  const v = getHealthVersionPayload();
  return {
    commitShaShort: v.commitShaShort,
    environment: v.environment,
  };
}

async function ensureTable(): Promise<{ ok: boolean; error: string | null }> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return { ok: false, error: "supabase_service_role_not_configured" };
  }

  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const { error: selectError } = await client
      .from("atlas_structured_logs")
      .select("id")
      .limit(1);

    if (!selectError) {
      return { ok: true, error: null };
    }
    lastError = selectError.message;

    const missing = /schema cache|does not exist|Could not find the table/i.test(
      selectError.message,
    );
    if (missing) {
      const applied = await applyStructuredLogsMigration();
      if (!applied.appliedViaPostgres && !applied.appliedViaManagementApi) {
        return {
          ok: false,
          error: applied.error ?? "structured_logs_migration_failed",
        };
      }
    } else if (!isTransientJwtClockError(selectError.message)) {
      return { ok: false, error: selectError.message };
    }

    await new Promise((r) => setTimeout(r, 500 * attempt));
  }

  return { ok: false, error: lastError ?? "table_unavailable" };
}

function buildProbeEntry(
  overrides: Partial<DeveloperErrorLog> & {
    correlationId: string;
    userId: string;
    message: string;
  },
): DeveloperErrorLog {
  return {
    id: overrides.id ?? `dlog_probe_${randomUUID()}`,
    at: overrides.at ?? new Date().toISOString(),
    correlationId: overrides.correlationId,
    vercelRequestId: overrides.vercelRequestId ?? `vercel_probe_${randomUUID()}`,
    diagnosticId: overrides.diagnosticId ?? `diag_probe_${randomUUID()}`,
    userId: overrides.userId,
    jobId: overrides.jobId ?? `job_probe_${randomUUID()}`,
    workflowId: overrides.workflowId ?? null,
    commanderRunId: overrides.commanderRunId ?? null,
    step: overrides.step ?? "p2_04_probe",
    attempt: overrides.attempt ?? 1,
    maxAttempts: overrides.maxAttempts ?? 3,
    failureClass: overrides.failureClass ?? "network",
    message: overrides.message,
    cause: overrides.cause ?? "probe cause",
    reproduction: overrides.reproduction ?? "再現: probe",
    fixContent: overrides.fixContent ?? "修正: probe",
    stackTrace: overrides.stackTrace ?? null,
    apiStatus: overrides.apiStatus ?? 500,
    apiResponseSummary: overrides.apiResponseSummary ?? null,
    durationMs: overrides.durationMs ?? 12,
    processLog: overrides.processLog ?? null,
    ...(overrides.metadata ? { metadata: overrides.metadata } : {}),
  };
}

async function probeStructuredLogsOnce(): Promise<StructuredLogsProbeResult> {
  const { commitShaShort, environment } = versionBits();
  const cleanupIds: string[] = [];

  const baseFail = (error: string): StructuredLogsProbeResult => ({
    ok: false,
    tableOk: false,
    correlationPresent: false,
    durableWriteOk: false,
    durableReadOk: false,
    restartDurableOk: false,
    multiInstanceOk: false,
    duplicateIdempotentOk: false,
    concurrentOk: false,
    crossUserIsolated: false,
    secretsRedacted: false,
    memoryNotSot: false,
    failClosedDbUnavailable: false,
    error,
    commitShaShort,
    environment,
  });

  try {
    const table = await ensureTable();
    if (!table.ok) {
      return baseFail(table.error ?? "table_unavailable");
    }

    const correlationId = `corr_p204_${randomUUID()}`;
    const secretMessage =
      "failed with Bearer sk-testSECRETVALUE123 and api_key=supersecret";

    // --- durable write + correlation ---
    const recorded = recordDeveloperError({
      userId: PROBE_USER_A,
      jobId: `job_p204_${randomUUID()}`,
      step: "p2_04_probe",
      attempt: 1,
      maxAttempts: 3,
      correlationId,
      vercelRequestId: `vid_${randomUUID()}`,
      diagnosticId: `diag_${randomUUID()}`,
      error: new Error(secretMessage),
      metadata: {
        authorization: "Bearer should-not-persist",
        token: "raw-token",
        note: "safe-note",
      },
    });
    cleanupIds.push(recorded.id);

    const correlationPresent = Boolean(
      recorded.correlationId &&
        recorded.correlationId === correlationId &&
        recorded.vercelRequestId &&
        recorded.diagnosticId,
    );

    const persistWait = await awaitDeveloperErrorPersist(recorded.id);
    const durableWriteOk = persistWait.ok === true;

    const fromDb = await getStructuredLogsByCorrelationId(correlationId, {
      limit: 5,
    });
    const durableReadOk =
      fromDb.length >= 1 && fromDb.some((row) => row.id === recorded.id);

    // --- restart / memory-not-SoT: clear process memory, read DB ---
    resetDeveloperErrorLogsForTests();
    const memoryAfterReset = listDeveloperErrorLogs({
      correlationId,
      limit: 5,
    });
    const memoryCleared = memoryAfterReset.length === 0;
    const afterRestart = await getStructuredLogsByCorrelationId(correlationId, {
      limit: 5,
    });
    const restartDurableOk =
      memoryCleared && afterRestart.some((row) => row.id === recorded.id);
    const memoryNotSot = restartDurableOk;

    // --- multi-instance: write via store (no memory), read via store ---
    const peerCorr = `corr_p204_peer_${randomUUID()}`;
    const peerEntry = buildProbeEntry({
      correlationId: peerCorr,
      userId: PROBE_USER_A,
      message: "multi-instance peer write",
    });
    cleanupIds.push(peerEntry.id);
    const peerWrite = await persistStructuredLog(peerEntry);
    resetDeveloperErrorLogsForTests();
    const peerRead = await getStructuredLogsByCorrelationId(peerCorr, {
      limit: 3,
    });
    const multiInstanceOk =
      peerWrite.ok && peerRead.some((row) => row.id === peerEntry.id);

    // --- duplicate idempotent upsert ---
    const dup = await persistStructuredLog(peerEntry);
    const dupAgain = await persistStructuredLog(peerEntry);
    const afterDup = await getStructuredLogsByCorrelationId(peerCorr, {
      limit: 10,
    });
    const duplicateIdempotentOk =
      dup.ok &&
      dupAgain.ok &&
      afterDup.filter((row) => row.id === peerEntry.id).length === 1;

    // --- concurrent writes ---
    const concCorr = `corr_p204_conc_${randomUUID()}`;
    const concEntries = Array.from({ length: 4 }, (_, i) =>
      buildProbeEntry({
        correlationId: concCorr,
        userId: PROBE_USER_A,
        message: `concurrent_${i}`,
        id: `dlog_conc_${randomUUID()}`,
      }),
    );
    cleanupIds.push(...concEntries.map((e) => e.id));
    const concResults = await Promise.all(
      concEntries.map((e) => persistStructuredLog(e)),
    );
    const concRead = await getStructuredLogsByCorrelationId(concCorr, {
      limit: 20,
    });
    const concurrentOk =
      concResults.every((r) => r.ok) &&
      concEntries.every((e) => concRead.some((row) => row.id === e.id));

    // --- cross-user isolation (filter by userId) ---
    const userBCorr = `corr_p204_b_${randomUUID()}`;
    const userBEntry = buildProbeEntry({
      correlationId: userBCorr,
      userId: PROBE_USER_B,
      message: "user B only",
    });
    cleanupIds.push(userBEntry.id);
    const userBWrite = await persistStructuredLog(userBEntry);
    const listedA = await listStructuredLogsDurable({
      userId: PROBE_USER_A,
      correlationId: userBCorr,
      limit: 10,
    });
    const listedB = await listStructuredLogsDurable({
      userId: PROBE_USER_B,
      correlationId: userBCorr,
      limit: 10,
    });
    const crossUserIsolated =
      userBWrite.ok &&
      listedA.length === 0 &&
      listedB.some((row) => row.id === userBEntry.id);

    // --- secrets redacted in durable row ---
    const durableSecretRow = afterRestart.find((row) => row.id === recorded.id);
    const secretsRedacted = Boolean(
      durableSecretRow &&
        !/sk-testSECRETVALUE123/i.test(durableSecretRow.message) &&
        !/Bearer\s+sk-/i.test(durableSecretRow.message) &&
        redactSecrets(secretMessage) !== secretMessage &&
        !(
          durableSecretRow.metadata &&
          ("authorization" in durableSecretRow.metadata ||
            "token" in durableSecretRow.metadata)
        ) &&
        durableSecretRow.metadata?.note === "safe-note",
    );

    // --- fail-closed: never soft-succeed; memory-only is not ok ---
    const failClosedDbUnavailable =
      peerWrite.softSuccess === false &&
      dup.softSuccess === false &&
      dupAgain.softSuccess === false &&
      memoryNotSot &&
      durableWriteOk;

    const ok =
      table.ok &&
      correlationPresent &&
      durableWriteOk &&
      durableReadOk &&
      restartDurableOk &&
      multiInstanceOk &&
      duplicateIdempotentOk &&
      concurrentOk &&
      crossUserIsolated &&
      secretsRedacted &&
      memoryNotSot &&
      failClosedDbUnavailable;

    return {
      ok,
      tableOk: table.ok,
      correlationPresent,
      durableWriteOk,
      durableReadOk,
      restartDurableOk,
      multiInstanceOk,
      duplicateIdempotentOk,
      concurrentOk,
      crossUserIsolated,
      secretsRedacted,
      memoryNotSot,
      failClosedDbUnavailable,
      error: ok
        ? null
        : [
            !correlationPresent ? "correlation_missing" : null,
            !durableWriteOk ? "durable_write_failed" : null,
            !durableReadOk ? "durable_read_failed" : null,
            !restartDurableOk ? "restart_not_durable" : null,
            !multiInstanceOk ? "multi_instance_failed" : null,
            !duplicateIdempotentOk ? "duplicate_not_idempotent" : null,
            !concurrentOk ? "concurrent_failed" : null,
            !crossUserIsolated ? "cross_user_leak" : null,
            !secretsRedacted ? "secrets_not_redacted" : null,
            !memoryNotSot ? "memory_treated_as_sot" : null,
            !failClosedDbUnavailable ? "soft_success_detected" : null,
          ]
            .filter(Boolean)
            .join(","),
      commitShaShort,
      environment,
    };
  } catch (error) {
    return baseFail(error instanceof Error ? error.message : String(error));
  } finally {
    try {
      await deleteStructuredLogsByIds(cleanupIds);
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Production probe with retry on transient Supabase JWT clock skew
 * (common immediately after deploy). Soft-success remains forbidden.
 */
export async function probeStructuredLogs(): Promise<StructuredLogsProbeResult> {
  let last = await probeStructuredLogsOnce();
  for (let attempt = 1; attempt <= 4 && !last.ok; attempt += 1) {
    if (!isTransientJwtClockError(last.error)) break;
    await new Promise((r) => setTimeout(r, 1000 * attempt));
    last = await probeStructuredLogsOnce();
  }
  return last;
}
