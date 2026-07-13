import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import {
  connectWordPressAccount,
  disconnectWordPressAccount,
} from "@/lib/integrations/wordpress/connection-service";
import { checkWordPressConnectionForUser } from "@/lib/integrations/wordpress/connection-status";
import type { WordPressConnectInput } from "@/lib/integrations/wordpress/types";

/**
 * GET — connection status (no credentials).
 * POST — connect / reconnect with Application Password (server-only persist).
 * DELETE — disconnect and wipe credentials.
 */
export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", connected: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const context = await resolveFeatureAccessContext();
  const result = await checkWordPressConnectionForUser({ userId, context });

  if (result.status === "feature_disabled") {
    return Response.json(result, { status: 403 });
  }
  if (
    result.status === "disconnected" ||
    result.status === "reconnect_required" ||
    result.status === "auth_failure"
  ) {
    return Response.json(result, { status: 409 });
  }
  if (result.status === "error") {
    return Response.json(result, { status: 502 });
  }

  return Response.json(result);
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await resolveFeatureAccessContext();
  if (!isFeatureEnabled("wordpress", context)) {
    return Response.json(
      { error: featureDisabledMessage("wordpress") },
      { status: 403 },
    );
  }

  let body: WordPressConnectInput;
  try {
    body = (await request.json()) as WordPressConnectInput;
  } catch {
    return Response.json(
      { error: "リクエスト本文が不正です" },
      { status: 400 },
    );
  }

  // Never log applicationPassword.
  try {
    await ensureExternalAuthHydrated(userId);

    const { requireBillingExternalIntegration } = await import(
      "@/lib/billing/access"
    );
    const { listExternalServiceConnections } = await import(
      "@/lib/integrations/external-services/store"
    );

    const connectedCount = listExternalServiceConnections(userId).filter(
      (row) => row.status === "connected",
    ).length;

    const existing = getExternalServiceConnection(userId, "wordpress");
    const reconnectExempt =
      existing.status === "connected" || existing.status === "error";

    if (!reconnectExempt) {
      const limitDenied = await requireBillingExternalIntegration(
        userId,
        connectedCount,
      );
      if (limitDenied) return limitDenied;
    }

    const result = await connectWordPressAccount(userId, {
      siteUrl: body.siteUrl,
      username: body.username,
      applicationPassword: body.applicationPassword,
    });

    return Response.json({
      connection: result.connection,
      message: result.message,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "WordPress接続に失敗しました";
    const status =
      message.includes("ご利用いただけません") || message.includes("プラン")
        ? 403
        : message.includes("入力") || message.includes("URL")
          ? 400
          : message.includes("認証")
            ? 401
            : 502;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureExternalAuthHydrated(userId);
    const connection = await disconnectWordPressAccount(userId);
    return Response.json(connection);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "WordPress連携の解除に失敗しました";
    return Response.json({ error: message }, { status: 500 });
  }
}
