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
import type { CreateAutomationV2Input } from "@/lib/automation-platform/types";
import type { DeliverableFormat } from "@/lib/deliverables/types";

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

function stepTypeForFormat(
  formats: DeliverableFormat[],
): "word_generate" | "excel_generate" | "powerpoint_generate" | "pdf_generate" {
  if (formats.includes("xlsx")) return "excel_generate";
  if (formats.includes("pptx")) return "powerpoint_generate";
  if (formats.includes("pdf") && !formats.includes("docx")) return "pdf_generate";
  return "word_generate";
}

function buildFollowUpAutomationInput(input: {
  title: string;
  content: string;
  frequency: FirstValueFrequency;
  formats: DeliverableFormat[];
  candidateLabel: string;
}): CreateAutomationV2Input {
  const stepType = stepTypeForFormat(input.formats);
  const timezone = "Asia/Tokyo";
  const trigger =
    input.frequency === "once"
      ? {
          type: "manual" as const,
          timezone,
          schedule: null,
          event: null,
          condition: null,
        }
      : {
          type: "schedule" as const,
          timezone,
          schedule: {
            frequency:
              input.frequency === "weekly"
                ? ("weekly" as const)
                : input.frequency === "monthly"
                  ? ("monthly" as const)
                  : ("daily" as const),
            hour: 9,
            minute: 0,
            daysOfWeek: input.frequency === "weekly" ? [1] : undefined,
            dayOfMonth: input.frequency === "monthly" ? 1 : undefined,
          },
          event: null,
          condition: null,
        };

  return {
    name: input.title,
    description: `初回体験から作成 — ${input.candidateLabel}`,
    // Draft until user activates — first deliverable already produced by immediate run.
    status: "draft",
    trigger,
    workflow: {
      version: 1,
      steps: [
        {
          id: "step-first-value",
          type: stepType,
          name: input.candidateLabel,
          order: 1,
          inputBindings: {},
          configuration: {
            title: input.title,
            content: input.content,
            firstValue: true,
          },
          requiresApproval: false,
          retryPolicy: { maxAttempts: 1, backoffMs: [] },
          timeoutMs: 120_000,
          onSuccess: null,
          onFailure: null,
          enabled: true,
        },
      ],
      onFailure: { strategy: "stop", notify: true },
      timeoutPolicy: {
        workflowTimeoutMs: 600_000,
        stepDefaultTimeoutMs: 120_000,
      },
    },
    executionPolicy: { mode: "run_then_notify" },
    instruction: {
      structuredOptions: {},
      freeformNotes: input.content,
    },
    rejectOnConflict: false,
  };
}

async function tryCreateFollowUpAutomation(
  userId: string,
  input: CreateAutomationV2Input,
): Promise<string | null> {
  try {
    const { resolveFeatureAccessContext } = await import(
      "@/lib/feature-flags/resolve-context"
    );
    const { automationPlatformService } = await import(
      "@/lib/automation-platform/service/automation-service"
    );
    const context = await resolveFeatureAccessContext();
    const created = await automationPlatformService.create(
      userId,
      input,
      context,
    );
    return created.id;
  } catch (error) {
    console.warn("[first-value] follow-up automation create skipped", error);
    return null;
  }
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
  let steps = buildInitialJourneySteps(candidate.label);
  steps = markJourneyStep(steps, "deliverable_ready", "running");

  const finalDeliverable = buildFirstValueDeliverableBody({
    candidate,
    title,
    content,
  });

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
            automationId: null,
            estimatedMinutesSaved: candidate.estimatedMinutesSaved,
            measuredMinutesSaved: null,
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
      "アプリ内へ保存しました（Google Drive接続時はDriveへ同期）",
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
    // Download stays pending until the user clicks — 仕事完了一覧の最後の一歩。
    steps = markJourneyStep(steps, "downloadable", "pending", primary.downloadUrl);

    const automationId = await tryCreateFollowUpAutomation(
      userId,
      buildFollowUpAutomationInput({
        title,
        content,
        frequency,
        formats: candidate.formats,
        candidateLabel: candidate.label,
      }),
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
      automationId,
      estimatedMinutesSaved: candidate.estimatedMinutesSaved,
      measuredMinutesSaved: candidate.estimatedMinutesSaved,
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
      automationId,
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
          automationId: null,
          estimatedMinutesSaved: candidate.estimatedMinutesSaved,
          measuredMinutesSaved: null,
          completedAt: null,
        } satisfies FirstValueJourney,
      },
      { status: 500 },
    );
  }
}
