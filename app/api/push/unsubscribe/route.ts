import { auth } from "@clerk/nextjs/server";

import {
  deactivatePushSubscription,
  deletePushSubscription,
} from "@/lib/push/subscription-store";
import { checkPushRateLimit } from "@/lib/push/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "Unauthorized", code: "authentication_required" },
      { status: 401 },
    );
  }

  if (!(await checkPushRateLimit(`unsubscribe:${userId}`, 20, 60_000))) {
    return Response.json(
      { error: "Rate limit exceeded", code: "rate_limit_exceeded" },
      { status: 429 },
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

  const payload = body as { endpoint?: unknown; hardDelete?: unknown };
  if (typeof payload.endpoint !== "string" || !payload.endpoint.trim()) {
    return Response.json(
      { error: "Invalid request", code: "invalid_request" },
      { status: 400 },
    );
  }

  if (payload.hardDelete === true) {
    await deletePushSubscription({ userId, endpoint: payload.endpoint });
  } else {
    await deactivatePushSubscription({ userId, endpoint: payload.endpoint });
  }

  return Response.json({ ok: true });
}
