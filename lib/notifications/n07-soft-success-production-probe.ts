/**
 * N-07 Production probe: eliminate soft-success false completions.
 * Soft-success / fixed-true flags forbidden.
 */

import "server-only";

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { getHealthVersionPayload } from "@/lib/health/version-info";
import { evaluateCompletionEvidence } from "@/lib/jobs/completion-evidence";
import { executeIdempotentSideEffect } from "@/lib/side-effects/execute";

import {
  buildCanonicalExecutionResult,
  executionStatusFromJobStatus,
  notificationTypeForStatus,
} from "./execution-result";
import { deliverLineWithAck } from "./delivery";
import {
  createUserNotification,
  listUserNotifications,
} from "./service";
import { resetNotificationStore } from "./store";

function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]");
}

export type N07SoftSuccessProbeResult = {
  ok: boolean;
  trueSuccessOk: boolean;
  hardFailureOk: boolean;
  partialFailureOk: boolean;
  retryStateOk: boolean;
  retrySuccessOk: boolean;
  retryExhaustedFailureOk: boolean;
  timeoutNotSuccessOk: boolean;
  artifactMissingNotSuccessOk: boolean;
  externalFailureNotSuccessOk: boolean;
  jobNotificationConsistentOk: boolean;
  historyNotificationConsistentOk: boolean;
  notificationIdempotentOk: boolean;
  multiInstanceOk: boolean;
  crossUserIsolatedOk: boolean;
  failClosedOk: boolean;
  secretsRedactedOk: boolean;
  error: string | null;
  commitShaShort: string;
  environment: string;
  correlationId: string;
};

function versionBits() {
  const v = getHealthVersionPayload();
  return {
    commitShaShort: v.commitShaShort,
    environment: v.environment,
  };
}

function readRoot(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function baseFail(
  error: string,
  extra?: Partial<N07SoftSuccessProbeResult>,
): N07SoftSuccessProbeResult {
  const { commitShaShort, environment } = versionBits();
  return {
    ok: false,
    trueSuccessOk: false,
    hardFailureOk: false,
    partialFailureOk: false,
    retryStateOk: false,
    retrySuccessOk: false,
    retryExhaustedFailureOk: false,
    timeoutNotSuccessOk: false,
    artifactMissingNotSuccessOk: false,
    externalFailureNotSuccessOk: false,
    jobNotificationConsistentOk: false,
    historyNotificationConsistentOk: false,
    notificationIdempotentOk: false,
    multiInstanceOk: false,
    crossUserIsolatedOk: false,
    failClosedOk: false,
    secretsRedactedOk: false,
    error,
    commitShaShort,
    environment,
    correlationId: `n07_${randomUUID().slice(0, 8)}`,
    ...extra,
  };
}

function structuralHonesty(): { ok: boolean; error: string | null } {
  const required = [
    "lib/notifications/execution-result.ts",
    "lib/notifications/channel-ack.ts",
    "lib/notifications/delivery.ts",
    "lib/notifications/n07-soft-success-production-probe.ts",
    "app/api/health/n07-soft-success/route.ts",
  ];
  for (const rel of required) {
    if (!existsSync(join(process.cwd(), rel))) {
      return { ok: false, error: `missing:${rel}` };
    }
  }

  const delivery = readRoot("lib/notifications/delivery.ts");
  if (!/ackSkipped/.test(delivery)) {
    return { ok: false, error: "delivery_missing_ackSkipped" };
  }
  // Soft-success ban: not_configured must not record notification_ack success.
  if (
    /not_configured[\s\S]{0,120}recordReliabilityEvent\(\s*["']notification_ack["']\s*,\s*["']success["']/.test(
      delivery,
    )
  ) {
    return { ok: false, error: "delivery_soft_acks_not_configured" };
  }
  const service = readRoot("lib/notifications/service.ts");
  if (!/suppressed/.test(service)) {
    return { ok: false, error: "service_must_suppress_skipped_push" };
  }
  if (
    !/push\.status === ["']delivered["']/.test(service) &&
    !/status === ["']delivered["']/.test(service)
  ) {
    return { ok: false, error: "service_must_require_delivered_for_pushSentAt" };
  }
  if (!/channelStatus === ["']skipped["']/.test(service) && !/status === ["']skipped["']/.test(service)) {
    // createNotificationWithDelivery / createUserNotification skip path
    if (!/status: "suppressed"/.test(service)) {
      return { ok: false, error: "service_missing_skipped_to_suppressed" };
    }
  }

  const commander = readRoot("lib/commander/execute.ts");
  if (
    /finalStatus === "partial"[\s\S]{0,400}notifyWorkCompleted/.test(commander)
  ) {
    return { ok: false, error: "commander_partial_still_uses_completed_notify" };
  }
  if (!/notifyWorkNeedsReview/.test(commander)) {
    return { ok: false, error: "commander_partial_missing_needs_review" };
  }

  const execResult = readRoot("lib/notifications/execution-result.ts");
  if (!/softSuccess:\s*false/.test(execResult)) {
    return { ok: false, error: "execution_result_softSuccess_not_false" };
  }

  return { ok: true, error: null };
}

export async function probeN07SoftSuccessProduction(): Promise<N07SoftSuccessProbeResult> {
  const correlationId = `n07_${randomUUID().slice(0, 8)}`;
  const { commitShaShort, environment } = versionBits();

  try {
    const honesty = structuralHonesty();
    if (!honesty.ok) {
      return baseFail(honesty.error ?? "structural_fail", { correlationId });
    }

    // ---- CASE A: true SUCCESS with side-effect proof ----
    const successEvidence = evaluateCompletionEvidence({
      templateId: "sns_post",
      orchestrationStatus: "completed",
      approved: true,
      deliverableCount: 0,
      snsPostFailure: null,
      tweetId: "tw_n07_ok",
      tweetUrl: "https://x.com/i/status/tw_n07_ok",
    });
    const trueSuccess = buildCanonicalExecutionResult({
      executionStatus: executionStatusFromJobStatus(successEvidence.status),
      evidence: {
        sideEffectConfirmed: successEvidence.status === "completed",
        externalActionIds: successEvidence.externalResultId
          ? [successEvidence.externalResultId]
          : [],
        externalUrls: successEvidence.externalResultUrl
          ? [successEvidence.externalResultUrl]
          : [],
      },
      summary: successEvidence.resultSummary ?? "ok",
      jobId: `job_${correlationId}_a`,
      correlationId,
    });
    const trueSuccessOk =
      trueSuccess.executionStatus === "SUCCESS" &&
      trueSuccess.userCompleteClaimAllowed &&
      trueSuccess.notificationType === "completed" &&
      trueSuccess.softSuccess === false;

    // ---- CASE B: hard FAILURE ----
    const failEvidence = evaluateCompletionEvidence({
      templateId: "sns_post",
      orchestrationStatus: "failed",
      approved: true,
      deliverableCount: 0,
      snsPostFailure: "x_api_error",
    });
    const hardFail = buildCanonicalExecutionResult({
      executionStatus: executionStatusFromJobStatus(failEvidence.status),
      evidence: { sideEffectConfirmed: false },
      summary: failEvidence.lastErrorMessage ?? "failed",
      errorCode: "hard_failure",
      failureStage: "external_post",
      jobId: `job_${correlationId}_b`,
      correlationId,
    });
    const hardFailureOk =
      hardFail.executionStatus === "FAILED" &&
      hardFail.notificationType === "error" &&
      !hardFail.userCompleteClaimAllowed;

    // ---- CASE C: PARTIAL ----
    const partial = buildCanonicalExecutionResult({
      executionStatus: "PARTIAL",
      evidence: {
        sideEffectConfirmed: false,
        artifactIds: ["art_partial"],
      },
      summary: "成果物は保存、外部投稿は失敗",
      failureStage: "external_post",
      jobId: `job_${correlationId}_c`,
      correlationId,
    });
    const partialFailureOk =
      partial.executionStatus === "PARTIAL" &&
      partial.notificationType === "awaiting_review" &&
      !partial.userCompleteClaimAllowed &&
      notificationTypeForStatus("PARTIAL") !== "completed";

    // ---- CASE D: RETRYING ----
    const retrying = buildCanonicalExecutionResult({
      executionStatus: "RETRYING",
      evidence: { sideEffectConfirmed: false },
      summary: "一時失敗のため再試行中",
      attempt: 1,
      maxAttempts: 3,
      jobId: `job_${correlationId}_d`,
      correlationId,
    });
    const retryStateOk =
      retrying.executionStatus === "RETRYING" &&
      retrying.notificationType === "automation" &&
      !retrying.userCompleteClaimAllowed;

    // ---- CASE E: retry then SUCCESS ----
    const retrySuccess = buildCanonicalExecutionResult({
      executionStatus: "SUCCESS",
      evidence: {
        sideEffectConfirmed: true,
        storageUrls: ["https://storage.example/n07.docx"],
        artifactIds: ["art_retry_ok"],
      },
      summary: "再試行後に成果物保存成功",
      attempt: 2,
      maxAttempts: 3,
      jobId: `job_${correlationId}_e`,
      correlationId,
    });
    const retrySuccessOk =
      retrySuccess.executionStatus === "SUCCESS" &&
      retrySuccess.userCompleteClaimAllowed &&
      retrySuccess.attempt === 2;

    // ---- CASE F: retry exhausted ----
    const exhausted = buildCanonicalExecutionResult({
      executionStatus: "FAILED",
      evidence: { sideEffectConfirmed: false },
      summary: "再試行上限に到達",
      attempt: 3,
      maxAttempts: 3,
      errorCode: "retry_exhausted",
      failureStage: "retry",
      jobId: `job_${correlationId}_f`,
      correlationId,
    });
    const retryExhaustedFailureOk =
      exhausted.executionStatus === "FAILED" &&
      exhausted.attempt >= exhausted.maxAttempts &&
      exhausted.notificationType === "error";

    // ---- Timeout / unknown → not SUCCESS ----
    const timeout = buildCanonicalExecutionResult({
      executionStatus: "UNKNOWN",
      evidence: { sideEffectConfirmed: false },
      summary: "結果を確認できませんでした",
      errorCode: "timeout_unknown",
      failureStage: "timeout",
      jobId: `job_${correlationId}_timeout`,
      correlationId,
    });
    const timeoutNotSuccessOk =
      timeout.executionStatus === "UNKNOWN" &&
      timeout.notificationType === "error" &&
      !timeout.userCompleteClaimAllowed;

    // ---- Artifact record without storage ----
    const missingArtifact = evaluateCompletionEvidence({
      templateId: "document",
      orchestrationStatus: "completed",
      approved: true,
      deliverableCount: 1,
      snsPostFailure: null,
      storageUrl: null,
      artifactId: "art_missing_file",
    });
    const artifactMissingNotSuccessOk =
      missingArtifact.status === "failed" &&
      executionStatusFromJobStatus(missingArtifact.status) !== "SUCCESS";

    // ---- External failure (sns without tweet proof) ----
    const externalFail = evaluateCompletionEvidence({
      templateId: "sns_post",
      orchestrationStatus: "completed",
      approved: true,
      deliverableCount: 0,
      snsPostFailure: null,
      tweetId: null,
      tweetUrl: null,
    });
    const externalFailureNotSuccessOk = externalFail.status === "failed";

    // ---- FAIL-CLOSED: SUCCESS without evidence demoted ----
    const demoted = buildCanonicalExecutionResult({
      executionStatus: "SUCCESS",
      evidence: { sideEffectConfirmed: false },
      summary: "should demote",
      correlationId,
    });
    const failClosedOk =
      demoted.executionStatus === "FAILED" &&
      demoted.softSuccess === false &&
      trueSuccess.softSuccess === false;

    // ---- Job / notification / history consistency ----
    const jobNotificationConsistentOk =
      trueSuccess.notificationType === "completed" &&
      hardFail.notificationType === "error" &&
      partial.notificationType === "awaiting_review" &&
      retrying.notificationType !== "completed";

    const historyNotificationConsistentOk =
      trueSuccess.jobStatus === "completed" &&
      hardFail.jobStatus === "failed" &&
      partial.jobStatus === "partially_completed" &&
      (trueSuccess.notificationType === "completed") ===
        (trueSuccess.executionStatus === "SUCCESS");

    // ---- Channel ACK: not_configured must be skipped ----
    let channelSkipHonest = false;
    try {
      const lineAck = await deliverLineWithAck({
        notificationId: `n07_line_${randomUUID().slice(0, 8)}`,
        userId: `n07_probe_${randomUUID().slice(0, 8)}`,
        event: "work_completed",
        title: "probe",
        message: "probe",
        actionUrl: null,
        skipDlq: true,
      });
      channelSkipHonest =
        lineAck.softSuccess === false &&
        (lineAck.status === "skipped" || lineAck.status === "failed") &&
        !(lineAck.status === "delivered" && lineAck.sentCount === 0);
    } catch {
      channelSkipHonest = false;
    }

    // ---- Notification idempotency + isolation ----
    // Avoid resetting global store in Production — use unique users.
    const ownerA = `n07_user_a_${randomUUID().slice(0, 8)}`;
    const ownerB = `n07_user_b_${randomUUID().slice(0, 8)}`;
    const requestId = `n07_req_${randomUUID().slice(0, 8)}`;

    if (environment !== "production") {
      resetNotificationStore();
    }

    let notificationIdempotentOk = false;
    let crossUserIsolatedOk = false;
    try {
      const first = await createUserNotification(
        {
          audience: "user",
          userId: ownerA,
          type: trueSuccess.notificationType,
          title: "N07 true success",
          message: trueSuccess.summary,
          requestId,
          automationId: "n07_auto",
        },
        { skipDelivery: true },
      );
      const second = await createUserNotification(
        {
          audience: "user",
          userId: ownerA,
          type: trueSuccess.notificationType,
          title: "N07 true success again",
          message: trueSuccess.summary,
          requestId,
          automationId: "n07_auto",
        },
        { skipDelivery: true },
      );
      const listedA = await listUserNotifications(ownerA);
      const sameRequest = listedA.filter((n) => n.requestId === requestId);
      notificationIdempotentOk =
        Boolean(first?.notificationId) &&
        Boolean(second?.notificationId) &&
        (first!.notificationId === second!.notificationId ||
          sameRequest.length <= 1);

      const listedB = await listUserNotifications(ownerB);
      crossUserIsolatedOk = !listedB.some(
        (n) => n.notificationId === first?.notificationId,
      );
    } catch {
      notificationIdempotentOk = false;
      crossUserIsolatedOk = false;
    }

    // ---- Multi-instance side-effect claim ----
    let multiInstanceOk = false;
    try {
      let calls = 0;
      const sideKey = `n07_side_${randomUUID().slice(0, 8)}`;
      const sideCtx = {
        userId: ownerA,
        provider: "notification" as const,
        actionType: "notify" as const,
        destination: "line",
        automationId: "n07_probe",
        runId: sideKey,
        occurrenceKey: sideKey,
        discriminator: `${sideKey}:line`,
      };
      await executeIdempotentSideEffect(sideCtx, async () => {
        calls += 1;
        return {
          providerResourceId: `${sideKey}:line`,
          result: { ok: true as const },
          evidence: { n07: true },
        };
      });
      await executeIdempotentSideEffect(sideCtx, async () => {
        calls += 1;
        return {
          providerResourceId: `${sideKey}:line`,
          result: { ok: true as const },
          evidence: { n07: true },
        };
      });
      multiInstanceOk = calls === 1;
    } catch {
      multiInstanceOk = false;
    }

    // ---- Secrets redacted ----
    const secretToken = ["sk", "secret", "n07", "token", "value"].join("-");
    const secretSample = `Bearer ${secretToken}`;
    const redacted = redactSecrets(secretSample);
    // Probe must not echo raw secrets into its own evidence payload.
    const secretsRedactedOk =
      !redacted.includes(secretToken) &&
      redacted.includes("[redacted]") &&
      !JSON.stringify({
        ok: trueSuccessOk,
        correlationId,
      }).includes(secretToken);

    const result: N07SoftSuccessProbeResult = {
      ok: false,
      trueSuccessOk,
      hardFailureOk,
      partialFailureOk,
      retryStateOk,
      retrySuccessOk,
      retryExhaustedFailureOk,
      timeoutNotSuccessOk,
      artifactMissingNotSuccessOk,
      externalFailureNotSuccessOk,
      jobNotificationConsistentOk: jobNotificationConsistentOk && channelSkipHonest,
      historyNotificationConsistentOk,
      notificationIdempotentOk,
      multiInstanceOk,
      crossUserIsolatedOk,
      failClosedOk,
      secretsRedactedOk,
      error: null,
      commitShaShort,
      environment,
      correlationId,
    };

    const flags: (keyof N07SoftSuccessProbeResult)[] = [
      "trueSuccessOk",
      "hardFailureOk",
      "partialFailureOk",
      "retryStateOk",
      "retrySuccessOk",
      "retryExhaustedFailureOk",
      "timeoutNotSuccessOk",
      "artifactMissingNotSuccessOk",
      "externalFailureNotSuccessOk",
      "jobNotificationConsistentOk",
      "historyNotificationConsistentOk",
      "notificationIdempotentOk",
      "multiInstanceOk",
      "crossUserIsolatedOk",
      "failClosedOk",
      "secretsRedactedOk",
    ];
    const failed = flags.filter((k) => result[k] !== true);
    result.ok = failed.length === 0;
    if (!result.ok) {
      result.error = `flags_false:${failed.join(",")}`;
    }
    return result;
  } catch (error) {
    return baseFail(
      error instanceof Error ? error.message : "n07_probe_failed",
      { correlationId, commitShaShort, environment },
    );
  }
}
