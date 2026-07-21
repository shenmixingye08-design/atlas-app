import { normalizeProjects } from "@/lib/compatibility";

import type { Project } from "./types";

export type FetchProjectByIdResult =
  | { status: "found"; project: Project }
  | { status: "not_found"; project: null }
  | { status: "unavailable"; project: null }
  | { status: "unauthorized"; project: null }
  | { status: "error"; project: null };

/**
 * Durable fetch of a single project (deliverable) by stable id from the server.
 *
 * Backs the notification deep link (`/projects/<id>`): when the current browser
 * has no local copy (other device / cold start / server-triggered run), this
 * resolves the exact 成果物 from the durable store. Never throws — resolves to a
 * typed status so the UI always renders an explicit state (never blank).
 */
export async function fetchProjectById(
  id: string,
): Promise<FetchProjectByIdResult> {
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (response.status === 401) {
      return { status: "unauthorized", project: null };
    }

    const data = (await response.json().catch(() => null)) as {
      status?: string;
      project?: Project | null;
    } | null;

    if (data?.status === "found" && data.project) {
      const [normalized] = normalizeProjects([data.project]);
      return { status: "found", project: normalized ?? data.project };
    }

    if (data?.status === "not_found") {
      return { status: "not_found", project: null };
    }

    if (data?.status === "unavailable") {
      return { status: "unavailable", project: null };
    }

    return { status: "error", project: null };
  } catch {
    return { status: "error", project: null };
  }
}
