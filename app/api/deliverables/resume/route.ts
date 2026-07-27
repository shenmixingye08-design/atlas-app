import { auth } from "@clerk/nextjs/server";

import { assertExportPathHasNoAiRegenerate } from "@/lib/deliverables/ai-export-policy";
import { generateDeliverables } from "@/lib/deliverables/engine";
import {
  claimWordJob,
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

  const claim = await claimWordJob({
    jobId,
    userId,
    assignment: existing.assignment,
    sourceContent: existing.sourceContent,
    baseFileName: existing.baseFileName,
    format: existing.format,
  });

  if (!claim.ok && claim.reason === "owned_by_other") {
    return Response.json(
      {
        status: "running",
        stage: claim.job.stage,
        message: "同じ依頼は現在処理中です。",
        actions: ["retry"],
      },
      { status: 409 },
    );
  }

  const resumeFrom = nextResumeStage(claim.ok ? claim.job : existing);

  try {
    const origin = new URL(request.url).origin;
    // Resume reuses stored sourceContent — no AI re-call on export path.
    assertExportPathHasNoAiRegenerate(undefined);
    const result = await generateDeliverables(
      {
        assignment: existing.assignment || "Word成果物の再開",
        finalDeliverable: existing.sourceContent,
        title: existing.baseFileName,
        formats: ["docx"],
      },
      origin,
      { userId, jobId, allowAiContentRetry: false },
    );

    const docx = result.deliverables.find((d) => d.format === "docx");
    if (!docx) {
      const reason = result.failures.map((f) => f.reasons.join(",")).join(";") || "resume_failed";
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
    return Response.json(
      {
        error: userMessageForFailure("unknown"),
        actions: recoveryActionsForFailure("unknown"),
      },
      { status: 500 },
    );
  }
}
