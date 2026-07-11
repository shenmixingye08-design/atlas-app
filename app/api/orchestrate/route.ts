import OpenAI from "openai";
import { auth } from "@clerk/nextjs/server";

import { runOrchestrationForUser } from "@/lib/orchestration/run-for-user";
import { formatUserFacingErrorText, toUserFacingError } from "@/lib/orchestration/user-errors";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  featureDisabledMessage,
  isOrchestrationFeatureEnabled,
  resolveOrchestrationFeatureFlag,
} from "@/lib/feature-flags/guards";
import { recordOpenAiFailureIfApplicable } from "@/lib/owner/error-monitoring/telemetry";
import { enforceAiRateLimit } from "@/lib/http/enforce-ai-rate-limit";

type RequestBody = {
  assignment?: unknown;
  metadata?: unknown;
};

function parseRequestBody(body: RequestBody): {
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
} | { error: string } {
  if (typeof body.assignment !== "string" || !body.assignment.trim()) {
    return {
      error: "assignment is required and must be a non-empty string",
    };
  }

  if (
    body.metadata !== undefined &&
    (typeof body.metadata !== "object" || body.metadata === null)
  ) {
    return { error: "metadata must be an object" };
  }

  return {
    assignment: body.assignment.trim(),
    ...(body.metadata !== undefined && {
      metadata: body.metadata as Readonly<Record<string, unknown>>,
    }),
  };
}

function handleError(error: unknown): Response {
  if (
    error instanceof Error &&
    error.message === "OPENAI_API_KEY is not configured"
  ) {
    return Response.json(
      { error: "AI service is not configured" },
      { status: 503 },
    );
  }

  if (error instanceof OpenAI.APIError) {
    recordOpenAiFailureIfApplicable(error, "orchestrate");
    const userError = toUserFacingError(error);
    return Response.json(
      { error: formatUserFacingErrorText(userError) },
      { status: error.status ?? 500 },
    );
  }

  console.error("[Atlas /api/orchestrate]", error);

  recordOpenAiFailureIfApplicable(error, "orchestrate");
  const userError = toUserFacingError(error);
  return Response.json(
    { error: formatUserFacingErrorText(userError) },
    { status: 500 },
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseRequestBody(body);

  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const accessContext = await resolveFeatureAccessContext();
  if (!isOrchestrationFeatureEnabled(parsed, accessContext)) {
    const flagId = resolveOrchestrationFeatureFlag(parsed);
    return Response.json(
      { error: featureDisabledMessage(flagId) },
      { status: 403 },
    );
  }

  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requireBillingForAssignment } = await import("@/lib/billing/access");
    const billingDenied = await requireBillingForAssignment(userId, parsed);
    if (billingDenied) return billingDenied;

    const limited = enforceAiRateLimit(userId);
    if (limited) return limited;

    const run = await runOrchestrationForUser({
      assignment: parsed.assignment,
      userId,
      metadata: parsed.metadata,
      notify: true,
      recordLearning: true,
    });

    const { recordAuditLogSafe, auditRequestContext } = await import(
      "@/lib/owner/audit-log"
    );
    const ctx = auditRequestContext(request);
    recordAuditLogSafe({
      userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "request",
      action: "request_create",
      targetId: null,
      result: "success",
      reason: parsed.assignment.slice(0, 200),
    });

    return Response.json({
      ...run.result,
      ...(run.workMemory && { workMemory: run.workMemory }),
      ...(run.workMemoryCandidates &&
        run.workMemoryCandidates.length > 0 && {
          workMemoryCandidates: run.workMemoryCandidates,
        }),
    });
  } catch (error) {
    try {
      const { userId } = await auth();
      const { recordAuditLogSafe, auditRequestContext } = await import(
        "@/lib/owner/audit-log"
      );
      const ctx = auditRequestContext(request);
      recordAuditLogSafe({
        userId: userId ?? null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        category: "request",
        action: "request_create",
        targetId: null,
        result: "failure",
        reason: error instanceof Error ? error.message : "request failed",
      });
    } catch {
      // ignore
    }
    return handleError(error);
  }
}
