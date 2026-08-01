import { auth } from "@clerk/nextjs/server";

import {
  trackFunnelEvent,
  type FunnelEventName,
} from "@/lib/product-funnel/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set<FunnelEventName>([
  "home_view",
  "sample_select",
  "request_start",
  "request_submit",
  "job_progress_view",
  "artifact_ready",
  "artifact_preview",
  "artifact_download",
  "artifact_revise",
  "reuse_from_history",
  "automation_create",
  "external_connect_start",
  "billing_upgrade_view",
  "first_success",
  "error_shown",
]);

type Body = {
  name?: unknown;
  sessionKey?: unknown;
  requestId?: unknown;
  jobId?: unknown;
  artifactId?: unknown;
  meta?: unknown;
};

/** Minimal funnel ingest — no PII, auth optional (sessionKey opaque). */
export async function POST(request: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  if (!ALLOWED.has(name as FunnelEventName)) {
    return Response.json({ error: "Unknown event" }, { status: 400 });
  }

  // Touch auth so authenticated pages can correlate later without storing email.
  const { userId } = await auth();

  const meta =
    body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
      ? (body.meta as Record<string, string | number | boolean | null>)
      : undefined;

  // Strip any accidental long strings
  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      if (typeof v === "string" && v.length > 64) meta[k] = v.slice(0, 64);
      if (/password|token|secret|prompt|content/i.test(k)) delete meta[k];
    }
  }

  trackFunnelEvent(name as FunnelEventName, {
    sessionKey:
      typeof body.sessionKey === "string" ? body.sessionKey.slice(0, 40) : null,
    requestId: typeof body.requestId === "string" ? body.requestId : null,
    jobId: typeof body.jobId === "string" ? body.jobId : null,
    artifactId: typeof body.artifactId === "string" ? body.artifactId : null,
    meta: {
      ...(meta ?? {}),
      authed: Boolean(userId),
    },
  });

  return Response.json({ ok: true });
}
