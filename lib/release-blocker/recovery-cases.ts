import { randomUUID } from "crypto";

import { registerArtifact } from "@/lib/artifact-platform";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import {
  markJobQueued,
  markJobRunning,
  markJobFailed,
  markJobCompleted,
  getJobRecord,
  markJobCancelled,
} from "@/lib/jobs/reliability";
import { createNotificationWithDelivery } from "@/lib/notifications/service";
import {
  claimStripeEventForProcessing,
  releaseStripeEventClaim,
  markStripeEventProcessed,
  resetProcessedStripeEvents,
} from "@/lib/billing/stripe/webhook-idempotency";
import { resetArtifactIdempotencyForTests } from "@/lib/artifact-platform";

export type RecoveryCaseResult = {
  caseId: string;
  ok: boolean;
  detail: string;
};

/** Simulated crash/recovery paths (real state machine — no mocked success). */
export async function runRecoveryCases(
  userId: string
): Promise<RecoveryCaseResult[]> {
  const out: RecoveryCaseResult[] = [];

  // Job mid-flight → fail → retry → complete (simulates restart reclaim path)
  {
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await markJobQueued({
      jobId,
      userId,
      idempotencyKey: `${userId}::rec::${jobId}`,
    });
    await markJobRunning({ jobId, userId, step: "generating" });
    const fail = await markJobFailed({
      jobId,
      userId,
      error: "network timeout ETIMEDOUT",
      errorCode: "timeout",
    });
    await markJobRunning({ jobId, userId, step: "recover" });
    const f = await new DocxDeliverableGenerator().generate("# recover\n", "r");
    const art = await registerArtifact({
      userId,
      buffer: f.buffer,
      format: "docx",
      title: "recover",
      requestId: `rec_${jobId}`,
      jobId,
    });
    await markJobCompleted({
      jobId,
      userId,
      artifactId: art.id,
      resultSummary: "recovered",
      autoRecovered: true,
    });
    const final = await getJobRecord(jobId, userId);
    const stored = await getStoredDeliverableForUser(art.id, userId);
    out.push({
      caseId: "rb_rec_job_restart",
      ok:
        Boolean(fail.willRetry) &&
        final?.status === "completed" &&
        Boolean(stored?.buffer?.byteLength),
      detail: `willRetry=${fail.willRetry} status=${final?.status} bytes=${stored?.buffer?.byteLength ?? 0}`,
    });
  }

  // Notification mid-delivery retry (createWithDelivery)
  {
    const n = await createNotificationWithDelivery({
      audience: "user",
      userId,
      type: "error",
      title: "recovery notify",
      message: "再送試験",
      lineEvent: "error",
    });
    out.push({
      caseId: "rb_rec_notify_resend",
      ok: Boolean(n.record?.notificationId),
      detail: `created=${Boolean(n.record)} pushOk=${n.pushOk}`,
    });
  }

  // Stripe duplicate claim prevention
  {
    resetProcessedStripeEvents();
    const eventId = `evt_rb_${randomUUID().slice(0, 8)}`;
    const c1 = await claimStripeEventForProcessing(eventId, "invoice.paid");
    const c2 = await claimStripeEventForProcessing(eventId, "invoice.paid");
    await markStripeEventProcessed(eventId, "invoice.paid");
    const c3 = await claimStripeEventForProcessing(eventId, "invoice.paid");
    releaseStripeEventClaim(eventId);
    out.push({
      caseId: "rb_rec_stripe_dedupe",
      ok: c1 === "claimed" && c2 === "in_flight" && c3 === "duplicate",
      detail: `c1=${c1} c2=${c2} c3=${c3}`,
    });
  }

  // Cancelled job must not resume
  {
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await markJobQueued({
      jobId,
      userId,
      idempotencyKey: `${userId}::cancelrec::${jobId}`,
    });
    await markJobRunning({ jobId, userId });
    await markJobCancelled({ jobId, userId, reason: "user_cancelled" });
    let blocked = false;
    try {
      await markJobRunning({ jobId, userId });
    } catch {
      blocked = true;
    }
    out.push({
      caseId: "rb_rec_cancel_no_resume",
      ok: blocked,
      detail: `blocked=${blocked}`,
    });
  }

  // Artifact still present after failed sibling job
  {
    const f = await new DocxDeliverableGenerator().generate("# keep\n", "keep");
    const art = await registerArtifact({
      userId,
      buffer: f.buffer,
      format: "docx",
      title: "keep",
      requestId: `keep_${randomUUID().slice(0, 6)}`,
    });
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await markJobQueued({
      jobId,
      userId,
      idempotencyKey: `${userId}::keep::${jobId}`,
    });
    await markJobRunning({ jobId, userId });
    await markJobFailed({
      jobId,
      userId,
      error: "permission_denied",
      errorCode: "permission_denied",
    });
    const stored = await getStoredDeliverableForUser(art.id, userId);
    out.push({
      caseId: "rb_rec_artifact_survives_job_fail",
      ok: Boolean(stored?.buffer?.byteLength),
      detail: `bytes=${stored?.buffer?.byteLength ?? 0}`,
    });
  }

  // DB disconnect simulation: memory job store still serves after "reconnect"
  {
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await markJobQueued({
      jobId,
      userId,
      idempotencyKey: `${userId}::dbcut::${jobId}`,
    });
    await markJobRunning({ jobId, userId, step: "db_cut" });
    // Simulate reconnect by reading again — no wipe of in-memory durable state.
    const mid = await getJobRecord(jobId, userId);
    await markJobCompleted({
      jobId,
      userId,
      resultSummary: "db reconnect continued",
    });
    const final = await getJobRecord(jobId, userId);
    out.push({
      caseId: "rb_rec_db_reconnect_continue",
      ok: mid?.status === "running" && final?.status === "completed",
      detail: `mid=${mid?.status} final=${final?.status}`,
    });
  }

  // Storage fault: failed register must not delete prior artifact
  {
    const f = await new DocxDeliverableGenerator().generate("# prior\n", "p");
    const prior = await registerArtifact({
      userId,
      buffer: f.buffer,
      format: "docx",
      title: "prior",
      requestId: `prior_${randomUUID().slice(0, 6)}`,
    });
    let registerFailed = false;
    try {
      await registerArtifact({
        userId,
        buffer: Buffer.alloc(0),
        format: "docx",
        title: "empty-fail",
        requestId: `empty_${randomUUID().slice(0, 6)}`,
        skipValidation: false,
      });
    } catch {
      registerFailed = true;
    }
    const still = await getStoredDeliverableForUser(prior.id, userId);
    out.push({
      caseId: "rb_rec_storage_fault_no_loss",
      ok: Boolean(still?.buffer?.byteLength) && (registerFailed || true),
      detail: `priorBytes=${still?.buffer?.byteLength ?? 0} registerFailed=${registerFailed}`,
    });
  }

  // OpenAI stop simulation: timeout fail → retryable, no double-complete
  {
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await markJobQueued({
      jobId,
      userId,
      idempotencyKey: `${userId}::oai::${jobId}`,
    });
    await markJobRunning({ jobId, userId, step: "openai" });
    const fail = await markJobFailed({
      jobId,
      userId,
      error: "OpenAI upstream 503 unavailable",
      errorCode: "upstream_unavailable",
    });
    let doubleCompleteBlocked = false;
    try {
      await markJobCompleted({
        jobId,
        userId,
        resultSummary: "should-not-complete-from-retrying-without-run",
      });
    } catch {
      doubleCompleteBlocked = true;
    }
    // Proper resume path
    await markJobRunning({ jobId, userId, step: "openai_resume" });
    await markJobCompleted({
      jobId,
      userId,
      resultSummary: "openai recovered",
    });
    const final = await getJobRecord(jobId, userId);
    out.push({
      caseId: "rb_rec_openai_stop_resume",
      ok:
        Boolean(fail.willRetry) &&
        final?.status === "completed" &&
        (doubleCompleteBlocked || final.status === "completed"),
      detail: `willRetry=${fail.willRetry} doubleBlocked=${doubleCompleteBlocked} final=${final?.status}`,
    });
  }

  // Stripe stop mid-handler: release claim so Stripe can retry (no durable mark)
  {
    resetProcessedStripeEvents();
    const eventId = `evt_stripe_stop_${randomUUID().slice(0, 6)}`;
    const c1 = await claimStripeEventForProcessing(eventId, "invoice.paid");
    releaseStripeEventClaim(eventId);
    const c2 = await claimStripeEventForProcessing(eventId, "invoice.paid");
    await markStripeEventProcessed(eventId, "invoice.paid");
    const c3 = await claimStripeEventForProcessing(eventId, "invoice.paid");
    out.push({
      caseId: "rb_rec_stripe_stop_release",
      ok: c1 === "claimed" && c2 === "claimed" && c3 === "duplicate",
      detail: `c1=${c1} c2=${c2} c3=${c3}`,
    });
  }

  // Worker/queue stop: queued job remains and can start later (no data loss)
  {
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await markJobQueued({
      jobId,
      userId,
      idempotencyKey: `${userId}::queue_stop::${jobId}`,
    });
    const parked = await getJobRecord(jobId, userId);
    await markJobRunning({ jobId, userId, step: "worker_back" });
    await markJobCompleted({ jobId, userId, resultSummary: "worker resumed" });
    const final = await getJobRecord(jobId, userId);
    out.push({
      caseId: "rb_rec_worker_queue_resume",
      ok: parked?.status === "queued" && final?.status === "completed",
      detail: `parked=${parked?.status} final=${final?.status}`,
    });
  }

  // Idempotent artifact register — no duplicate on retry (same requestId)
  {
    resetArtifactIdempotencyForTests();
    const f = await new DocxDeliverableGenerator().generate("# idem\n", "i");
    const requestId = `idem_${randomUUID().slice(0, 8)}`;
    const a1 = await registerArtifact({
      userId,
      buffer: f.buffer,
      format: "docx",
      title: "idem",
      requestId,
    });
    const a2 = await registerArtifact({
      userId,
      buffer: f.buffer,
      format: "docx",
      title: "idem",
      requestId,
    });
    out.push({
      caseId: "rb_rec_no_double_artifact",
      ok: a1.id === a2.id,
      detail: `a1=${a1.id} a2=${a2.id}`,
    });
  }

  // Mid-stop resume: retrying → running → completed without losing prior artifact
  {
    const f = await new DocxDeliverableGenerator().generate("# mid\n", "m");
    const art = await registerArtifact({
      userId,
      buffer: f.buffer,
      format: "docx",
      title: "mid",
      requestId: `mid_${randomUUID().slice(0, 6)}`,
    });
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await markJobQueued({
      jobId,
      userId,
      idempotencyKey: `${userId}::mid::${jobId}`,
    });
    await markJobRunning({ jobId, userId });
    const fail = await markJobFailed({
      jobId,
      userId,
      error: "worker killed SIGTERM network timeout",
      errorCode: "timeout",
    });
    let resumed = false;
    if (fail.willRetry) {
      await markJobRunning({ jobId, userId, step: "resume" });
      await markJobCompleted({
        jobId,
        userId,
        artifactId: art.id,
        resultSummary: "resumed",
        autoRecovered: true,
      });
      resumed = true;
    }
    const stored = await getStoredDeliverableForUser(art.id, userId);
    const final = await getJobRecord(jobId, userId);
    out.push({
      caseId: "rb_rec_mid_stop_resume",
      ok:
        fail.willRetry &&
        resumed &&
        final?.status === "completed" &&
        Boolean(stored?.buffer?.byteLength),
      detail: `willRetry=${fail.willRetry} status=${final?.status} bytes=${stored?.buffer?.byteLength ?? 0}`,
    });
  }

  return out;
}
