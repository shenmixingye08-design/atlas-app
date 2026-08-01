import { auth } from "@clerk/nextjs/server";

import {
  ALL_FUNNEL_EVENT_NAMES,
  trackFunnelEvent,
  type FunnelEventName,
} from "@/lib/product-funnel/events";
import { isEffectiveBetaUserEmail } from "@/lib/owner/beta-users";
import { getClerkUserPrimaryEmail } from "@/lib/auth/get-clerk-user-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set<string>(ALL_FUNNEL_EVENT_NAMES);

type Body = {
  name?: unknown;
  sessionKey?: unknown;
  sessionId?: unknown;
  anonymousUserId?: unknown;
  requestId?: unknown;
  jobId?: unknown;
  artifactId?: unknown;
  deviceType?: unknown;
  viewport?: unknown;
  previousScreen?: unknown;
  currentScreen?: unknown;
  errorCode?: unknown;
  durationMs?: unknown;
  meta?: unknown;
};

function asShortString(value: unknown, max = 64): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

/** Minimal funnel ingest — no PII payloads, no prompts. */
export async function POST(request: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  if (!ALLOWED.has(name)) {
    return Response.json({ error: "Unknown event" }, { status: 400 });
  }

  const { userId } = await auth();
  let isBeta = false;
  if (userId) {
    try {
      const email = await getClerkUserPrimaryEmail(userId);
      isBeta = isEffectiveBetaUserEmail(email);
    } catch {
      isBeta = false;
    }
  }

  const meta =
    body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
      ? (body.meta as Record<string, string | number | boolean | null>)
      : undefined;

  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      if (typeof v === "string" && v.length > 64) meta[k] = v.slice(0, 64);
      if (/password|token|secret|prompt|content|email/i.test(k)) {
        delete meta[k];
      }
    }
  }

  trackFunnelEvent(name as FunnelEventName, {
    sessionId: asShortString(body.sessionId ?? body.sessionKey, 40),
    anonymousUserId: asShortString(body.anonymousUserId, 40),
    requestId: asShortString(body.requestId, 80),
    jobId: asShortString(body.jobId, 80),
    artifactId: asShortString(body.artifactId, 80),
    deviceType: asShortString(body.deviceType, 20),
    viewport: asShortString(body.viewport, 32),
    previousScreen: asShortString(body.previousScreen, 120),
    currentScreen: asShortString(body.currentScreen, 120),
    errorCode: asShortString(body.errorCode, 64),
    durationMs:
      typeof body.durationMs === "number" && Number.isFinite(body.durationMs)
        ? Math.max(0, Math.floor(body.durationMs))
        : null,
    isBeta,
    meta: {
      ...(meta ?? {}),
      authed: Boolean(userId),
      beta: isBeta,
    },
  });

  return Response.json({ ok: true });
}
