import { auth } from "@clerk/nextjs/server";

import { sendTestPush } from "@/lib/push/dispatch";
import { checkPushRateLimit } from "@/lib/push/rate-limit";
import { isWebPushConfigured } from "@/lib/push/vapid";

export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isWebPushConfigured()) {
    return Response.json({ error: "Web Push not configured" }, { status: 503 });
  }

  if (!checkPushRateLimit(userId, 3, 60_000)) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    const result = await sendTestPush(userId);
    if (result.sent === 0) {
      return Response.json(
        { error: "No active subscriptions or delivery failed" },
        { status: 400 },
      );
    }
    return Response.json({
      ok: true,
      message: `テスト通知を ${result.sent} 台に送信しました`,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Test push failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
