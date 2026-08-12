import { authorizeAutomationTick } from "@/lib/automations/tick-auth";
import { drainWorkQueue } from "@/lib/work-queue";
import {
  classifyWorkQueueFailure,
  isRetryableWorkQueueFailure,
} from "@/lib/work-queue/failure-class";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Independent drain — keep bounded; GHA fans out multiple workers. */
export const maxDuration = 60;

/**
 * Independent worker drain endpoint — not tied to a user HTTP session.
 * Auth: CRON_SECRET bearer or ATLAS owner session.
 *
 * Production: concurrent Minute Scheduler fan-out previously returned opaque
 * HTTP 500 `{ok:false}` on pool exhaustion. Now classifies failureClass and
 * retries inside drainWorkQueue; retryable exhaustion is not a silent PASS.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await authorizeAutomationTick(request);
  if (!gate.ok) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "10", 10);
  const workerId = url.searchParams.get("workerId") ?? undefined;

  try {
    const result = await drainWorkQueue({
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 10,
      workerId: workerId ?? undefined,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const diag = classifyWorkQueueFailure(error, "drain");
    const message = clientSafeMessage(error, "Worker drain failed");
    console.error("[worker drain] failed", {
      developerCode: diag.developerCode,
      failureClass: diag.failureClass,
      errorName: diag.errorName,
      pgCode: diag.pgCode,
      substage: diag.substage,
      workerId: workerId ?? null,
    });

    // Retryable pool/connection blips: 503 (not 500). Fatal → 500.
    // Empty-queue success never reaches here (ok:true leased:0).
    const status = isRetryableWorkQueueFailure(diag) ? 503 : 500;
    return Response.json(
      {
        ok: false,
        error: message,
        failedStage: diag.failedStage,
        developerCode: diag.developerCode,
        failureClass: diag.failureClass,
        errorName: diag.errorName,
        pgCode: diag.pgCode,
        substage: diag.substage,
        postgresUrlConfigured: diag.postgresUrlConfigured,
        retryable: isRetryableWorkQueueFailure(diag),
      },
      { status },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
