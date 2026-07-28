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
 */
export type NotificationResultPayload =
  | {
      status: "deliverable";
      targetType: string;
      targetId: string;
      project: Project;
    }
  | { status: "redirect"; url: string }
  | { status: "unavailable"; targetType: string; targetId: string }
  | { status: "error"; code: ResultResolutionCode };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ status: "error", code: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const notificationId = id?.trim();
  if (!notificationId) {
    return Response.json({ status: "error", code: "not_found" }, { status: 404 });
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
          commanderStatus: resolved.trace.commanderStatus,
          workJobStatus: resolved.trace.workJobStatus,
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
    if (
      notification &&
      resolveTrace &&
      (code === "not_saved" ||
        code === "generation_failed" ||
        code === "unknown" ||
        code === "not_found")
    ) {
      const refined = refineMissingDeliverableCode({
        notification,
        trace: resolveTrace,
      });
      // Prefer refined cause codes over coarse not_saved / unknown.
      if (
        refined === "pending" ||
        refined === "timeout" ||
        refined === "ai_error" ||
        refined === "storage_failed" ||
        refined === "notification_failed" ||
        refined === "generation_failed"
      ) {
        code = refined;
      }
    }
    console.warn(
      `[results] notification=${notificationId} user=${userId} code=${code} http=${decision.http}`,
    );
    return Response.json(
      { status: "error", code },
      { status: decision.http },
    );
  }

  if (decision.status === "redirect") {
    return Response.json({ status: "redirect", url: decision.url });
  }

  if (decision.status === "unavailable") {
    return Response.json({
      status: "unavailable",
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
    return Response.json({ status: "error", code }, { status: 200 });
  }

  return Response.json({
    status: "deliverable",
    targetType: decision.targetType,
    targetId: decision.targetId,
    project,
  } satisfies NotificationResultPayload);
}
