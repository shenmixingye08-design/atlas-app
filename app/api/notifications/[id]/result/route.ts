import { auth } from "@clerk/nextjs/server";

import { ensureNotificationsHydrated } from "@/lib/notifications/durable";
import type { ResultResolutionCode } from "@/lib/notifications/result-messages";
import { decideNotificationResult } from "@/lib/notifications/result-resolution";
import {
  refineMissingDeliverableCode,
  resolveDeliverableLookupForNotification,
} from "@/lib/notifications/resolve-deliverable-lookup";
import {
  isDeliverableTargetType,
  resolveNotificationTarget,
} from "@/lib/notifications/result-target";
import { findNotification } from "@/lib/notifications/store";
import type { GenerationFailureDiagnostic } from "@/lib/orchestration/generation-failure";
import type { Project } from "@/lib/projects/types";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Resolved result payload for a notification. Backs `/results/<notificationId>`:
 * the browser that clicks「結果を見る」resolves the EXACT outcome from the
 * notification alone — never a list page.
 *
 * - `deliverable` — the durable 成果物 to render in full (project attached).
 * - `redirect`    — a working detail deep link (automation / X post result).
 * - `unavailable` — no durable backend (dev); client falls back to local cache.
 * - `error`       — a typed, user-facing reason (never blank).
 *
 * `requestStatus` = HTTP/API layer (always ok when this JSON is returned with 200).
 * `generationStatus` = whether the underlying work produced a usable 成果物.
 */
export type NotificationResultPayload =
  | {
      status: "deliverable";
      requestStatus: "ok";
      generationStatus: "ready";
      targetType: string;
      targetId: string;
      project: Project;
    }
  | {
      status: "redirect";
      requestStatus: "ok";
      generationStatus: "ready";
      url: string;
    }
  | {
      status: "unavailable";
      requestStatus: "ok";
      generationStatus: "unknown";
      targetType: string;
      targetId: string;
    }
  | {
      status: "error";
      requestStatus: "ok";
      generationStatus: "failed" | "pending" | "unknown";
      code: ResultResolutionCode;
      diagnostic?: GenerationFailureDiagnostic | null;
      projectError?: string | null;
      failedStage?: string | null;
      workJobId?: string | null;
      commanderRunId?: string | null;
      wordFileFound?: boolean;
    };

function generationStatusForCode(
  code: ResultResolutionCode,
): "failed" | "pending" | "unknown" {
  if (code === "pending" || code === "timeout") return "pending";
  if (
    code === "generation_failed" ||
    code === "not_saved" ||
    code === "not_found" ||
    code === "forbidden" ||
    code === "legacy" ||
    code === "unknown"
  ) {
    return code === "generation_failed" || code === "not_saved"
      ? "failed"
      : "unknown";
  }
  return "unknown";
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      {
        status: "error",
        requestStatus: "error",
        generationStatus: "unknown",
        code: "unauthorized",
      },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const notificationId = id?.trim();
  if (!notificationId) {
    return Response.json(
      {
        status: "error",
        requestStatus: "ok",
        generationStatus: "unknown",
        code: "not_found",
      },
      { status: 404 },
    );
  }

  // Cold serverless instances hold no in-memory notifications — hydrate first so
  // the record (and its target ids) can be located durably.
  await ensureNotificationsHydrated(userId);
  const notification = findNotification(notificationId);

  let project: Project | null = null;
  let lookup = undefined as
    | Awaited<
        ReturnType<typeof resolveDeliverableLookupForNotification>
      >["lookup"]
    | undefined;
  let resolveTrace: Awaited<
    ReturnType<typeof resolveDeliverableLookupForNotification>
  >["trace"] | null = null;

  if (notification) {
    const target = resolveNotificationTarget(notification);
    const owned =
      notification.audience !== "user" || notification.userId === userId;
    if (owned && target.kind !== "none" && isDeliverableTargetType(target.kind)) {
      const resolved = await resolveDeliverableLookupForNotification({
        notification,
        userId,
      });
      lookup = resolved.lookup;
      project = resolved.project;
      resolveTrace = resolved.trace;
      console.info(
        "[results] deliverable_lookup",
        JSON.stringify({
          notificationId,
          userId: `${userId.slice(0, 8)}…`,
          primaryTargetId: resolved.trace.primaryTargetId,
          triedIds: resolved.trace.triedIds,
          resolvedProjectId: resolved.resolvedProjectId,
          found: resolved.lookup.durable && resolved.lookup.found,
          wordFileFound: resolved.trace.wordFileFound,
          wordFileId: resolved.trace.wordFileId,
          commanderStatus: resolved.trace.commanderStatus,
          workJobStatus: resolved.trace.workJobStatus,
          workJobId: resolved.trace.workJobId,
          commanderRunId: resolved.trace.commanderRunId,
          projectError: resolved.trace.projectError,
          resultStatus: resolved.trace.resultStatus,
          failedStage: resolved.trace.generationFailure?.failedStage ?? null,
          errorCode: resolved.trace.generationFailure?.errorCode ?? null,
          diagnosticId: resolved.trace.generationFailure?.diagnosticId ?? null,
          fileDeliverableIds: resolved.trace.fileDeliverableIds,
        }),
      );
    }
  }

  const decision = decideNotificationResult({
    notification,
    requesterUserId: userId,
    lookup,
  });

  if (decision.status === "error") {
    let code = decision.code;
    // Never leave users on generic「成果物が見つかりません」when we can classify.
    if (code === "not_saved" && notification && resolveTrace) {
      code = refineMissingDeliverableCode({
        notification,
        trace: resolveTrace,
      });
      if (
        /timeout|Timeout|時間内|ETIMEDOUT/i.test(
          `${notification.title} ${notification.message}`,
        )
      ) {
        code = "timeout";
      }
    }
    const generationStatus = generationStatusForCode(code);
    console.warn(
      `[results] notification=${notificationId} user=${userId} code=${code} http=${decision.http} requestStatus=ok generationStatus=${generationStatus} failedStage=${resolveTrace?.generationFailure?.failedStage ?? "null"} projectError=${(resolveTrace?.projectError ?? "").slice(0, 120)}`,
    );
    return Response.json(
      {
        status: "error",
        requestStatus: "ok",
        generationStatus,
        code,
        diagnostic: resolveTrace?.generationFailure ?? null,
        projectError: resolveTrace?.projectError ?? null,
        failedStage: resolveTrace?.generationFailure?.failedStage ?? null,
        workJobId: resolveTrace?.workJobId ?? null,
        commanderRunId: resolveTrace?.commanderRunId ?? null,
        wordFileFound: resolveTrace?.wordFileFound ?? false,
      } satisfies NotificationResultPayload,
      { status: decision.http },
    );
  }

  if (decision.status === "redirect") {
    return Response.json({
      status: "redirect",
      requestStatus: "ok",
      generationStatus: "ready",
      url: decision.url,
    } satisfies NotificationResultPayload);
  }

  if (decision.status === "unavailable") {
    return Response.json({
      status: "unavailable",
      requestStatus: "ok",
      generationStatus: "unknown",
      targetType: decision.targetType,
      targetId: decision.targetId,
    } satisfies NotificationResultPayload);
  }

  if (!project) {
    // Lookup said ready/generating/failed without a project body — refine.
    const code: ResultResolutionCode =
      lookup && lookup.durable && lookup.found
        ? lookup.displayKind === "failed"
          ? "generation_failed"
          : lookup.displayKind === "generating"
            ? "pending"
            : "not_saved"
        : "not_saved";
    return Response.json(
      {
        status: "error",
        requestStatus: "ok",
        generationStatus: generationStatusForCode(code),
        code,
        diagnostic: resolveTrace?.generationFailure ?? null,
        projectError: resolveTrace?.projectError ?? null,
        failedStage: resolveTrace?.generationFailure?.failedStage ?? null,
        workJobId: resolveTrace?.workJobId ?? null,
        commanderRunId: resolveTrace?.commanderRunId ?? null,
        wordFileFound: resolveTrace?.wordFileFound ?? false,
      } satisfies NotificationResultPayload,
      { status: 200 },
    );
  }

  return Response.json({
    status: "deliverable",
    requestStatus: "ok",
    generationStatus: "ready",
    targetType: decision.targetType,
    targetId: decision.targetId,
    project,
  } satisfies NotificationResultPayload);
}
