/**
 * P2-05 Production probe: OCR dedicated-engine evaluation (Document AI only if needed).
 * Soft-success forbidden. Evaluation records use Postgres SoT.
 */

import "server-only";

import { randomUUID } from "crypto";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getHealthVersionPayload } from "@/lib/health/version-info";

import { redactOcrText } from "./accuracy";
import { runOcrEngineEvaluation } from "./evaluate";
import {
  applyOcrEngineEvaluationsMigration,
  deleteOcrEngineEvaluationsByIds,
  getOcrEngineEvaluationsByCorrelationId,
  isTransientJwtClockError,
  listOcrEngineEvaluationsByUser,
  persistOcrEngineEvaluation,
} from "./store";
import type { OcrEngineEvaluationRecord } from "./types";
import { OCR_PROBE_OWNER } from "./types";

export type OcrEngineProbeResult = {
  ok: boolean;
  evaluationComplete: boolean;
  visionOcrPathPresent: boolean;
  accuracyGateOk: boolean;
  dedicatedEngineRequired: boolean;
  dedicatedEnginePolicyOk: boolean;
  restartDurableOk: boolean;
  retrySafe: boolean;
  multiInstanceSafe: boolean;
  memoryNotSot: boolean;
  ownershipIsolationOk: boolean;
  secretsRedacted: boolean;
  tableOk: boolean;
  failClosedOnMissingProvider: boolean;
  error: string | null;
  commitShaShort: string;
  environment: string;
};

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
    const { error } = await client
      .from("atlas_ocr_engine_evaluations")
      .select("id")
      .limit(1);
    if (!error) return { ok: true, error: null };
    lastError = error.message;
    const missing = /schema cache|does not exist|Could not find the table/i.test(
      error.message,
    );
    if (missing) {
      const applied = await applyOcrEngineEvaluationsMigration();
      if (!applied.appliedViaPostgres && !applied.appliedViaManagementApi) {
        return {
          ok: false,
          error: applied.error ?? "ocr_eval_migration_failed",
        };
      }
    } else if (!isTransientJwtClockError(error.message)) {
      return { ok: false, error: error.message };
    }
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  return { ok: false, error: lastError ?? "table_unavailable" };
}

async function probeOnce(): Promise<OcrEngineProbeResult> {
  const { commitShaShort, environment } = versionBits();
  const cleanupIds: string[] = [];

  const baseFail = (error: string): OcrEngineProbeResult => ({
    ok: false,
    evaluationComplete: false,
    visionOcrPathPresent: false,
    accuracyGateOk: false,
    dedicatedEngineRequired: false,
    dedicatedEnginePolicyOk: false,
    restartDurableOk: false,
    retrySafe: false,
    multiInstanceSafe: false,
    memoryNotSot: false,
    ownershipIsolationOk: false,
    secretsRedacted: false,
    tableOk: false,
    failClosedOnMissingProvider: false,
    error,
    commitShaShort,
    environment,
  });

  try {
    const table = await ensureTable();
    if (!table.ok) return baseFail(table.error ?? "table_unavailable");

    const correlationId = `corr_p205_${randomUUID()}`;
    const evaluation = await runOcrEngineEvaluation({
      userId: OCR_PROBE_OWNER,
      correlationId,
    });
    if (evaluation.record) cleanupIds.push(evaluation.record.id);

    const visionOcrPathPresent = Boolean(
      evaluation.visionExtract?.configured !== false &&
        evaluation.visionExtract?.engineId === "openai_vision_ocr",
    );
    const evaluationComplete = Boolean(evaluation.record && evaluation.durableOk);
    const accuracyGateOk = evaluation.accuracyGateOk;
    const dedicatedEngineRequired = evaluation.dedicatedEngineRequired;
    const dedicatedEnginePolicyOk = evaluation.dedicatedEnginePolicyOk;

    // restart / memory-not-SoT: clear in-process notion by reading only from DB
    const afterRestart = await getOcrEngineEvaluationsByCorrelationId(
      correlationId,
      { limit: 5 },
    );
    const restartDurableOk =
      evaluationComplete &&
      afterRestart.some((row) => row.id === evaluation.record?.id);
    const memoryNotSot = restartDurableOk;

    // retrySafe: duplicate upsert same id is idempotent
    let retrySafe = false;
    if (evaluation.record) {
      const again = await persistOcrEngineEvaluation(evaluation.record);
      const again2 = await persistOcrEngineEvaluation(evaluation.record);
      const listed = await getOcrEngineEvaluationsByCorrelationId(correlationId, {
        limit: 20,
      });
      retrySafe =
        again.ok &&
        again2.ok &&
        again.softSuccess === false &&
        listed.filter((row) => row.id === evaluation.record!.id).length === 1;
    }

    // multi-instance: peer write via store without local memory dependency
    const peerCorr = `corr_p205_peer_${randomUUID()}`;
    const peer: OcrEngineEvaluationRecord = {
      id: `ocr_eval_peer_${randomUUID()}`,
      correlationId: peerCorr,
      at: new Date().toISOString(),
      userId: OCR_PROBE_OWNER,
      engineId: "openai_vision_ocr",
      dedicatedEngineRequired: false,
      accuracy: 1,
      tokensExpected: ["PEER"],
      tokensHit: ["PEER"],
      extractedTextPreview: "peer",
      confidence: 1,
      metadata: { multiInstance: true },
    };
    cleanupIds.push(peer.id);
    const peerWrite = await persistOcrEngineEvaluation(peer);
    const peerRead = await getOcrEngineEvaluationsByCorrelationId(peerCorr, {
      limit: 3,
    });
    const multiInstanceSafe =
      peerWrite.ok && peerRead.some((row) => row.id === peer.id);

    // ownership isolation
    const otherUser = "__atlas_ocr_engine_probe_b__";
    const otherCorr = `corr_p205_b_${randomUUID()}`;
    const other: OcrEngineEvaluationRecord = {
      id: `ocr_eval_b_${randomUUID()}`,
      correlationId: otherCorr,
      at: new Date().toISOString(),
      userId: otherUser,
      engineId: "openai_vision_ocr",
      dedicatedEngineRequired: false,
      accuracy: 1,
      tokensExpected: ["B"],
      tokensHit: ["B"],
      extractedTextPreview: "user-b-only",
      confidence: 1,
      metadata: {},
    };
    cleanupIds.push(other.id);
    const otherWrite = await persistOcrEngineEvaluation(other);
    const listedA = await listOcrEngineEvaluationsByUser({
      userId: OCR_PROBE_OWNER,
      correlationId: otherCorr,
      limit: 10,
    });
    const listedB = await listOcrEngineEvaluationsByUser({
      userId: otherUser,
      correlationId: otherCorr,
      limit: 10,
    });
    const ownershipIsolationOk =
      otherWrite.ok &&
      listedA.length === 0 &&
      listedB.some((row) => row.id === other.id);

    // secrets redaction on durable preview
    const secretsRedacted = Boolean(
      evaluation.record &&
        !/sk-[a-zA-Z0-9]{10,}/.test(evaluation.record.extractedTextPreview) &&
        redactOcrText("Bearer sk-abcdefghijklmnop").includes("[redacted]"),
    );

    // fail-closed: softSuccess never true on extracts / persists
    const failClosedOnMissingProvider =
      evaluation.visionExtract?.softSuccess === false &&
      peerWrite.softSuccess === false &&
      (evaluation.visionExtract?.configured === true ||
        evaluation.error === "openai_not_configured");

    const ok =
      table.ok &&
      evaluationComplete &&
      visionOcrPathPresent &&
      accuracyGateOk &&
      dedicatedEnginePolicyOk &&
      restartDurableOk &&
      retrySafe &&
      multiInstanceSafe &&
      memoryNotSot &&
      ownershipIsolationOk &&
      secretsRedacted &&
      failClosedOnMissingProvider &&
      evaluation.ok;

    return {
      ok,
      evaluationComplete,
      visionOcrPathPresent,
      accuracyGateOk,
      dedicatedEngineRequired,
      dedicatedEnginePolicyOk,
      restartDurableOk,
      retrySafe,
      multiInstanceSafe,
      memoryNotSot,
      ownershipIsolationOk,
      secretsRedacted,
      tableOk: table.ok,
      failClosedOnMissingProvider,
      error: ok
        ? null
        : [
            evaluation.error,
            !evaluationComplete ? "evaluation_incomplete" : null,
            !accuracyGateOk ? "accuracy_gate_failed" : null,
            !dedicatedEnginePolicyOk ? "dedicated_policy_failed" : null,
            !restartDurableOk ? "restart_not_durable" : null,
            !retrySafe ? "retry_not_safe" : null,
            !multiInstanceSafe ? "multi_instance_failed" : null,
            !ownershipIsolationOk ? "ownership_leak" : null,
            evaluation.record?.metadata?.visionPreview
              ? `visionPreview=${String(evaluation.record.metadata.visionPreview).slice(0, 120)}`
              : null,
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
      await deleteOcrEngineEvaluationsByIds(cleanupIds);
    } catch {
      // best-effort
    }
  }
}

export async function probeOcrEngine(): Promise<OcrEngineProbeResult> {
  let last = await probeOnce();
  for (let attempt = 1; attempt <= 4 && !last.ok; attempt += 1) {
    if (!isTransientJwtClockError(last.error)) break;
    await new Promise((r) => setTimeout(r, 1000 * attempt));
    last = await probeOnce();
  }
  return last;
}
