import { auth } from "@clerk/nextjs/server";
import { connection } from "next/server";

import { getUserBillingSummary } from "@/lib/billing/service";
import { resolveUserSubscriptionDurable } from "@/lib/billing/subscriptions/store";
import {
  buildDurableReadDiagnosticId,
  logDurableReadFailure,
  readUnknownSupabaseError,
} from "@/lib/persistence/durable-read-log";
import { toPublicErrorResponse } from "@/lib/security/public-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  // Force a request-time dynamic boundary before reading Stripe env.
  await connection();

  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const diagnosticId = buildDurableReadDiagnosticId("billing_summary");
  try {
    await resolveUserSubscriptionDurable(userId);
    const summary = await getUserBillingSummary(userId);
    if (!summary.usageReady) {
      logDurableReadFailure({
        endpoint: "/api/billing/summary",
        userId,
        code: summary.usageError ?? "usage_unavailable",
        databaseCode: null,
        table: "atlas_billing_usage_counters",
        diagnosticId,
        message: summary.usageError ?? "usage_unavailable",
      });
    }
    return Response.json(summary, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const parsed = readUnknownSupabaseError(error);
    logDurableReadFailure({
      endpoint: "/api/billing/summary",
      userId,
      code: "billing_summary_unavailable",
      databaseCode: parsed.code,
      table: "atlas_billing_usage_counters",
      diagnosticId,
      failureStage: "durable_summary",
      subsystem: "billing",
      message: parsed.message,
    });
    return toPublicErrorResponse(error, {
      status: 503,
      code: "billing_summary_unavailable",
      diagnosticId,
      logLabel: "[api/billing/summary] unexpected failure",
      fallbackMessage: "利用状況を取得できませんでした",
    });
  }
}
