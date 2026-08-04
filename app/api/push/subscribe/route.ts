import { auth } from "@clerk/nextjs/server";

import { checkPushRateLimit } from "@/lib/push/rate-limit";
import { upsertPushSubscription } from "@/lib/push/subscription-store";
import { getVapidPublicKey, logVapidConfigIssues } from "@/lib/push/vapid";

export const runtime = "nodejs";

function isNonEmptyString(value: unknown, max = 2048): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "Unauthorized", code: "authentication_required" },
      { status: 401 },
    );
  }

  if (!checkPushRateLimit(`subscribe:${userId}`, 10, 60_000)) {
    return Response.json(
      { error: "Rate limit exceeded", code: "rate_limit_exceeded" },
      { status: 429 },
    );
  }

  if (!getVapidPublicKey()) {
    logVapidConfigIssues("subscribe");
    return Response.json(
      {
        error: "VAPID public key missing",
        code: "vapid_public_key_missing",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON", code: "invalid_request" },
      { status: 400 },
    );
  }

  const payload = body as {
    endpoint?: unknown;
    p256dh?: unknown;
    authKey?: unknown;
    platform?: unknown;
    browser?: unknown;
    deviceName?: unknown;
    userAgent?: unknown;
  };

  if (
    !isNonEmptyString(payload.endpoint, 4096) ||
    !isNonEmptyString(payload.p256dh, 512) ||
    !isNonEmptyString(payload.authKey, 512)
  ) {
    return Response.json(
      { error: "Invalid subscription", code: "invalid_subscription" },
      { status: 400 },
    );
  }

  const record = await upsertPushSubscription({
    userId,
    endpoint: payload.endpoint,
    p256dh: payload.p256dh,
    authKey: payload.authKey,
    platform:
      typeof payload.platform === "string" ? payload.platform.slice(0, 64) : null,
    browser:
      typeof payload.browser === "string" ? payload.browser.slice(0, 64) : null,
    deviceName:
      typeof payload.deviceName === "string"
        ? payload.deviceName.slice(0, 120)
        : null,
    userAgent:
      typeof payload.userAgent === "string"
        ? payload.userAgent.slice(0, 300)
        : null,
  });

  if (!record) {
    return Response.json(
      {
        error: "Persistence unavailable",
        code: "subscription_save_failed",
      },
      { status: 503 },
    );
  }

  return Response.json({
    subscription: {
      id: record.id,
      platform: record.platform,
      browser: record.browser,
      deviceName: record.deviceName,
      isActive: record.isActive,
      updatedAt: record.updatedAt,
    },
  });
}
