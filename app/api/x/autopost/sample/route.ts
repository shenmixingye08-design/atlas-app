import { auth } from "@clerk/nextjs/server";

import { consumeDistributedRateLimit } from "@/lib/http/rate-limit";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  generateAutoPostText,
  selectPostType,
} from "@/lib/integrations/x/post/autopost-generator";
import {
  X_SAMPLE_RATE_LIMIT,
  buildSampleSettings,
  parseXSampleInput,
} from "@/lib/integrations/x/post/autopost-sample";

/**
 * Pre-connect sample post. Generates text only — never posts to X, never
 * persists settings, does not count toward the monthly SNS quota.
 * Cost: one light generation, max 3 per user per day.
 */
export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const context = await resolveFeatureAccessContext();
  if (!isFeatureEnabled("x", context)) {
    return Response.json(
      { status: "feature_disabled", message: featureDisabledMessage("x") },
      { status: 403 },
    );
  }

  const input = parseXSampleInput(await request.json().catch(() => null));
  if (!input) {
    return Response.json(
      { status: "error", message: "テーマを60文字以内で入力してください。" },
      { status: 400 },
    );
  }

  const limit = await consumeDistributedRateLimit(
    `x-sample:${userId}`,
    X_SAMPLE_RATE_LIMIT,
  );
  if (!limit.allowed) {
    return Response.json(
      {
        status: "rate_limited",
        message: "見本は1日3回までです。Xを連携すると毎日自動で作成されます。",
      },
      { status: 429 },
    );
  }

  const generated = await generateAutoPostText({
    settings: buildSampleSettings(userId, input),
    postType: selectPostType(Date.now()),
    recentTexts: [],
    slotKey: `sample:${Date.now()}`,
  });

  return Response.json({
    status: "ready",
    text: generated.text,
    usedFallback: generated.usedFallback,
    remaining: limit.remaining,
  });
}
