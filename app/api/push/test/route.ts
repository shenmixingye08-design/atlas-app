import { auth } from "@clerk/nextjs/server";

import { isPushErrorCode } from "@/lib/push/errors";
import { sendTestPush } from "@/lib/push/dispatch";
import { checkPushRateLimit } from "@/lib/push/rate-limit";
import { logVapidConfigIssues } from "@/lib/push/vapid";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "Unauthorized", code: "authentication_required" },
      { status: 401 },
    );
  }

  const vapid = logVapidConfigIssues("test");
  if (!vapid.configured) {
    return Response.json(
      {
        error: "Web Push not configured",
        code: vapid.errorCode ?? "web_push_not_configured",
      },
      { status: 503 },
    );
  }

  // Strict limit: prevent test notification abuse.
  if (!checkPushRateLimit(`test:${userId}`, 3, 60_000)) {
    return Response.json(
      { error: "Rate limit exceeded", code: "rate_limit_exceeded" },
      { status: 429 },
    );
  }

  try {
    const result = await sendTestPush(userId);
    if (result.sent === 0) {
      return Response.json(
        {
          error: "No active subscriptions or delivery failed",
          code:
            result.failed > 0 ? "delivery_failed" : "no_active_subscription",
          sent: result.sent,
          failed: result.failed,
          invalid: result.invalid,
        },
        { status: 400 },
      );
    }
    return Response.json({
      ok: true,
      message: `テスト通知を ${result.sent} 台に送信しました`,
      sent: result.sent,
      failed: result.failed,
      invalid: result.invalid,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "delivery_failed";
    const code = isPushErrorCode(raw) ? raw : "delivery_failed";
    return Response.json({ error: "Test push failed", code }, { status: 500 });
  }
}
