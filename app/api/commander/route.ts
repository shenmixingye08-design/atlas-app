import OpenAI from "openai";
import { auth } from "@clerk/nextjs/server";

import {
  parseCommanderRequest,
  runCommanderRequest,
} from "@/lib/commander/service";
import {
  ensureCommanderRunsHydrated,
  listCommanderRunsForUser,
} from "@/lib/commander/run-store";
import { enforceAiRateLimit } from "@/lib/http/enforce-ai-rate-limit";
import { formatUserFacingErrorText, toUserFacingError } from "@/lib/orchestration/user-errors";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  featureDisabledMessage,
  isOrchestrationFeatureEnabled,
  resolveOrchestrationFeatureFlag,
} from "@/lib/feature-flags/guards";
import { recordOpenAiFailureIfApplicable } from "@/lib/owner/error-monitoring/telemetry";

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

  if (error instanceof Error && error.message === "Unauthorized") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (error instanceof Error && error.message === "Commander run not found") {
    return Response.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof OpenAI.APIError) {
    recordOpenAiFailureIfApplicable(error, "commander");
    const userError = toUserFacingError(error);
    return Response.json(
      { error: formatUserFacingErrorText(userError) },
      { status: error.status ?? 500 },
    );
  }

  console.error("[Atlas /api/commander]", error);
  recordOpenAiFailureIfApplicable(error, "commander");
  const userError = toUserFacingError(error);
  return Response.json(
    { error: formatUserFacingErrorText(userError) },
    { status: 500 },
  );
}

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureCommanderRunsHydrated(userId);
  return Response.json({ runs: listCommanderRunsForUser(userId) });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseCommanderRequest(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  if (parsed.mode === "execute" || parsed.mode === "confirm") {
    const accessContext = await resolveFeatureAccessContext();
    const flagInput = {
      assignment: parsed.assignment || "commander",
      metadata: parsed.metadata,
    };
    if (!isOrchestrationFeatureEnabled(flagInput, accessContext)) {
      const flagId = resolveOrchestrationFeatureFlag(flagInput);
      return Response.json(
        { error: featureDisabledMessage(flagId) },
        { status: 403 },
      );
    }
  }

  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (parsed.mode === "execute" || parsed.mode === "confirm") {
      const { requireBillingForAssignment } = await import("@/lib/billing/access");
      const billingDenied = await requireBillingForAssignment(userId, {
        assignment: parsed.assignment || "commander",
        metadata: parsed.metadata,
      });
      if (billingDenied) return billingDenied;

      const limited = enforceAiRateLimit(userId);
      if (limited) return limited;
    }

    const result = await runCommanderRequest({
      request: parsed,
      userId,
    });
    return Response.json(result);
  } catch (error) {
    return handleError(error);
  }
}
