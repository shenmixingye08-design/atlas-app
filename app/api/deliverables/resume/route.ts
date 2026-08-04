import { auth } from "@clerk/nextjs/server";

import { generateDeliverables } from "@/lib/deliverables/engine";
import {
  failWordJobIfStillRunning,
  getWordJob,
  nextResumeStage,
} from "@/lib/deliverables/word-job-stages";
import {
  classifyDeliverableError,
  recoveryActionsForFailure,
  userMessageForFailure,
} from "@/lib/deliverables/recovery-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  jobId?: unknown;
};

/**
 * Resume a Word deliverable job from the last successful stage.
 * Same jobId — no duplicate completed deliverable.
 *
 * IMPORTANT: Do not claim the lease here. `generateDeliverables` owns the
 * claim with a stable workerId. A pre-claim + engine claim caused permanent
 * `running` (owned_by_other) while the API falsely returned failed.
 */
export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: userMessageForFailure("auth") },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
  if (!jobId) {
    return Response.json({ error: "jobId is required" }, { status: 400 });
  }

  const existing = await getWordJob(jobId);
  if (!existing || existing.userId !== userId) {
    return Response.json(
      { error: userMessageForFailure("forbidden"), availability: "deleted" },
      { status: 404 },
    );
  }

  if (existing.status === "completed" && existing.deliverableId) {
    return Response.json({
      status: "completed",
      stage: existing.stage,
      deliverableId: existing.deliverableId,
      downloadUrl: `/api/deliverables/${existing.deliverableId}`,
      actions: ["retry_download"],
    });
  }

  const leaseValid =
    existing.status === "running" &&
    existing.leaseOwner &&
    existing.leaseExpiresAt &&
    new Date(existing.leaseExpiresAt).getTime() > Date.now();
  if (leaseValid) {
    return Response.json(
      {
        status: "running",
        stage: existing.stage,
        message: "同じ依頼は現在処理中です。",
        actions: ["retry"],
      },
      { status: 409 },
    );
  }

  const resumeFrom = nextResumeStage(existing);
  const workerId = `resume_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

  try {
    const origin = new URL(request.url).origin;
    const result = await generateDeliverables(
      {
        assignment: existing.assignment || "Word成果物の再開",
        finalDeliverable: existing.sourceContent,
        title: existing.baseFileName,
        formats: ["docx"],
      },
      origin,
      { userId, jobId, workerId },
    );

    const docx = result.deliverables.find((d) => d.format === "docx");
    if (!docx) {
      const reason =
        result.failures.map((f) => f.reasons.join(",")).join(";") ||
        "resume_failed";
      await failWordJobIfStillRunning(jobId, resumeFrom, reason);
      const kind = classifyDeliverableError(reason);
      return Response.json(
        {
          status: "failed",
          stage: resumeFrom,
          error: userMessageForFailure(kind),
          actions: recoveryActionsForFailure(kind),
          failures: result.failures,
        },
        { status: 422 },
      );
    }

    return Response.json({
      status: "completed",
      stage: "COMPLETED",
      resumedFrom: resumeFrom,
      deliverable: docx,
      downloadUrl: docx.downloadUrl,
      actions: ["retry_download"],
    });
  } catch (error) {
    console.error("[Atlas /api/deliverables/resume]", error);
    const message =
      error instanceof Error ? error.message : "resume_failed";
    await failWordJobIfStillRunning(jobId, resumeFrom, message);
    return Response.json(
      {
        status: "failed",
        error: userMessageForFailure("unknown"),
        actions: recoveryActionsForFailure("unknown"),
      },
      { status: 500 },
    );
  }
}
