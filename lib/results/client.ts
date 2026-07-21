"use client";

import { normalizeProjects } from "@/lib/compatibility";
import type { ResultResolutionCode } from "@/lib/notifications/result-messages";
import type { Project } from "@/lib/projects/types";

/**
 * Client-facing resolution of a notification → result. Mirrors the server
 * payload from `GET /api/notifications/<id>/result` but always resolves to a
 * typed value (never throws) so the results page renders an explicit state.
 */
export type NotificationResult =
  | { status: "deliverable"; targetType: string; targetId: string; project: Project }
  | { status: "redirect"; url: string }
  | { status: "unavailable"; targetType: string; targetId: string }
  | { status: "error"; code: ResultResolutionCode };

export async function fetchNotificationResult(
  notificationId: string,
): Promise<NotificationResult> {
  try {
    const response = await fetch(
      `/api/notifications/${encodeURIComponent(notificationId)}/result`,
      { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" },
    );

    // Map transport-level auth failures explicitly — the Clerk middleware may
    // short-circuit with its own `{ error }` body before our route runs, so we
    // rely on the HTTP status here (drives the results page's typed states).
    if (response.status === 401) return { status: "error", code: "unauthorized" };
    if (response.status === 403) return { status: "error", code: "forbidden" };

    const data = (await response.json().catch(() => null)) as
      | NotificationResult
      | null;

    if (!data || typeof data !== "object" || !("status" in data)) {
      return { status: "error", code: "unknown" };
    }

    if (data.status === "deliverable" && data.project) {
      const [normalized] = normalizeProjects([data.project]);
      return { ...data, project: normalized ?? data.project };
    }

    return data;
  } catch {
    return { status: "error", code: "unknown" };
  }
}
