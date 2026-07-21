import { auth } from "@clerk/nextjs/server";

import { loadPersistedProjectById } from "@/lib/commander/durable-store";
import { ensureNotificationsHydrated } from "@/lib/notifications/durable";
import type { ResultResolutionCode } from "@/lib/notifications/result-messages";
import {
  decideNotificationResult,
  type DeliverableLookup,
} from "@/lib/notifications/result-resolution";
import {
  isDeliverableTargetType,
  resolveNotificationTarget,
} from "@/lib/notifications/result-target";
import { findNotification } from "@/lib/notifications/store";
import { resolveDeliverableDisplayState } from "@/lib/projects/deliverable-state";
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

  // Load the durable 成果物 only when the target is a deliverable-family kind.
  let lookup: DeliverableLookup | undefined;
  let project: Project | null = null;
  if (notification) {
    const target = resolveNotificationTarget(notification);
    const owned =
      notification.audience !== "user" || notification.userId === userId;
    if (owned && target.kind !== "none" && isDeliverableTargetType(target.kind)) {
      const loaded = await loadPersistedProjectById({
        userId,
        projectId: target.targetId,
      });
      project = loaded.project;
      if (!loaded.durable) {
        lookup = { durable: false };
      } else if (!loaded.found || !loaded.project) {
        lookup = { durable: true, found: false };
      } else {
        lookup = {
          durable: true,
          found: true,
          displayKind: resolveDeliverableDisplayState(loaded.project).kind,
        };
      }
    }
  }

  const decision = decideNotificationResult({
    notification,
    requesterUserId: userId,
    lookup,
  });

  if (decision.status === "error") {
    // Log HTTP status + cause server-side (no secrets).
    console.warn(
      `[results] notification=${notificationId} user=${userId} code=${decision.code} http=${decision.http}`,
    );
    return Response.json(
      { status: "error", code: decision.code },
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

  return Response.json({
    status: "deliverable",
    targetType: decision.targetType,
    targetId: decision.targetId,
    project: project as Project,
  } satisfies NotificationResultPayload);
}
