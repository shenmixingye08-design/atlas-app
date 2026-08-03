import { randomUUID } from "node:crypto";

import { generateDeliverables } from "@/lib/deliverables/engine";
import {
  buildFirstValueDeliverableBody,
  getFirstValueCandidate,
  type FirstValueFrequency,
} from "@/lib/first-value";
import {
  buildInitialJourneySteps,
  markJourneyStep,
  type FirstValueJourney,
} from "@/lib/first-value/journey";
import { createNotification } from "@/lib/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  candidateId?: unknown;
  title?: unknown;
  content?: unknown;
  frequency?: unknown;
  idempotencyKey?: unknown;
};

function resolveOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${protocol}://${host}`;
  return new URL(request.url).origin;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request): Promise<Response> {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const candidate = getFirstValueCandidate(asString(body.candidateId));
  const title = asString(body.title) || candidate.defaultTitle;
  const content = asString(body.content) || candidate.defaultContentHint;
  const frequency = (asString(body.frequency) || "once") as FirstValueFrequency;
  const idempotencyKey =
    asString(body.idempotencyKey) || `fv_${randomUUID().replace(/-/g, "")}`;

  const jobId = `fv_${idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)}`;
  let steps = buildInitialJourneySteps();
  steps = markJourneyStep(steps, "job_created", "completed", title);
  steps = markJourneyStep(steps, "ai_executed", "running");

  const finalDeliverable = buildFirstValueDeliverableBody({
    candidate,
    title,
    content,
  });

  steps = markJourneyStep(steps, "ai_executed", "completed", "初回本文を用意しました");
  steps = markJourneyStep(steps, "deliverable_ready", "running");

  try {
    const origin = resolveOrigin(request);
    const result = await generateDeliverables(
      {
        assignment: `${candidate.label}: ${title}\n\n${content}`,
        finalDeliverable,
        title,
        formats: candidate.formats,
      },
      origin,
      {
        userId,
        jobId,
        templateId: null,
      },
    );

    if (result.deliverables.length === 0) {
      steps = markJourneyStep(
        steps,
        "deliverable_ready",
        "failed",
        result.failures[0]?.reasons?.[0] ?? "成果物を作成できませんでした",
      );
      return Response.json(
        {
          error: "deliverable_failed",
          journey: {
            jobId,
            title,
            candidateLabel: candidate.label,
            frequency,
            steps,
            downloadUrl: null,
            deliverableId: null,
            notificationId: null,
            estimatedMinutesSaved: candidate.estimatedMinutesSaved,
            completedAt: null,
          } satisfies FirstValueJourney,
        },
        { status: 422 },
      );
    }

    const primary = result.deliverables[0]!;
    steps = markJourneyStep(
      steps,
      "deliverable_ready",
      "completed",
      primary.fileName,
    );
    steps = markJourneyStep(
      steps,
      "saved",
      "completed",
      "成果物を保存しました",
    );

    const notification = createNotification({
      audience: "user",
      userId,
      type: "completed",
      title: "成果物が完成しました",
      message: `お待たせいたしました。「${title}」の成果物をご用意いたしました。`,
      relatedTaskId: jobId,
      relatedService: "atlas",
      actionUrl: primary.downloadUrl,
      lineEvent: "automation_completed",
    });

    steps = markJourneyStep(
      steps,
      "notified",
      "completed",
      notification?.notificationId ?? "in_app",
    );
    steps = markJourneyStep(
      steps,
      "downloadable",
      "completed",
      primary.downloadUrl,
    );

    const journey: FirstValueJourney = {
      jobId,
      title,
      candidateLabel: candidate.label,
      frequency,
      steps,
      downloadUrl: primary.downloadUrl,
      deliverableId: primary.id,
      notificationId: notification?.notificationId ?? null,
      estimatedMinutesSaved: candidate.estimatedMinutesSaved,
      completedAt: new Date().toISOString(),
    };

    return Response.json({
      journey,
      deliverables: result.deliverables.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        format: d.format,
        downloadUrl: d.downloadUrl,
      })),
      idempotencyKey,
      // Frequency is recorded for follow-up automation — Scheduler wait is NOT required for first value.
      followUpFrequency: frequency,
    });
  } catch (error) {
    console.error("[Atlas /api/first-value/run]", error);
    steps = markJourneyStep(
      steps,
      "deliverable_ready",
      "failed",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json(
      {
        error: "first_value_run_failed",
        journey: {
          jobId,
          title,
          candidateLabel: candidate.label,
          frequency,
          steps,
          downloadUrl: null,
          deliverableId: null,
          notificationId: null,
          estimatedMinutesSaved: candidate.estimatedMinutesSaved,
          completedAt: null,
        } satisfies FirstValueJourney,
      },
      { status: 500 },
    );
  }
}
