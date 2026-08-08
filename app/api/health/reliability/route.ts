import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { assertNoSecretMaterial } from "@/lib/security/redact";
import {
  MAX_IMMEDIATE_RETRIES,
  IMMEDIATE_RETRY_BACKOFF_MS,
} from "@/lib/reliability/retry";
import { RELIABILITY_TIMEOUTS } from "@/lib/reliability/timeouts";
import { WORK_QUEUE_WORKER_BATCH } from "@/lib/work-queue/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * P0-06 production evidence probe (public, safe flags only).
 * Never returns job payloads, user ids, event ids, SQL, or secrets.
 */

type FlagCheck = { id: string; ok: boolean };

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  const flagChecks: FlagCheck[] = [
    {
      id: "openai_timeout_configured",
      ok: RELIABILITY_TIMEOUTS.openai > 0 && RELIABILITY_TIMEOUTS.openai <= 120_000,
    },
    {
      id: "retry_bounded",
      ok:
        MAX_IMMEDIATE_RETRIES <= 3 &&
        IMMEDIATE_RETRY_BACKOFF_MS.length <= 3,
    },
    {
      id: "work_queue_batch_capped",
      ok: WORK_QUEUE_WORKER_BATCH > 0 && WORK_QUEUE_WORKER_BATCH <= 25,
    },
  ];

  // Static source posture (no secret values).
  let stripeClaimBeforeProcess = false;
  let stripeClaimLease = false;
  let stripeClaimFailClosed = false;
  let workQueueReclaimGuard = false;
  let xPostNoRetry = false;
  let v2ProdDispatchDisabled = false;
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const root = process.cwd();
    const webhook = await fs.readFile(
      path.join(root, "lib/billing/stripe/webhook.ts"),
      "utf8",
    );
    stripeClaimBeforeProcess =
      webhook.includes("claimStripeEventForProcessing") &&
      webhook.includes("releaseStripeEventClaim") &&
      webhook.includes("in_progress");

    const claimLease = await fs.readFile(
      path.join(root, "lib/billing/stripe/webhook-claim-lease.ts"),
      "utf8",
    );
    const persistence = await fs.readFile(
      path.join(root, "lib/billing/subscriptions/persistence.ts"),
      "utf8",
    );
    stripeClaimLease =
      claimLease.includes("leaseExpiresAtMs") &&
      persistence.includes("lease_expires_at") &&
      persistence.includes("WEBHOOK_CLAIM_STATUS.processing");
    stripeClaimFailClosed =
      persistence.includes("isAtlasProduction()") &&
      persistence.includes('reason: "unavailable"') &&
      !persistence.includes("claimWebhookEventInDurable(");

    const worker = await fs.readFile(
      path.join(root, "lib/work-queue/worker.ts"),
      "utf8",
    );
    workQueueReclaimGuard =
      worker.includes("unknown_outcome") &&
      worker.includes("SIDE_EFFECT_STEP_TYPES");

    const xClient = await fs.readFile(
      path.join(root, "lib/integrations/x/post/api-client.ts"),
      "utf8",
    );
    xPostNoRetry =
      xClient.includes("never retry the POST itself") &&
      xClient.includes("createTweetOnce(input)");

    const tick = await fs.readFile(
      path.join(root, "app/api/automations/tick/route.ts"),
      "utf8",
    );
    v2ProdDispatchDisabled =
      tick.includes("isAtlasProduction") &&
      tick.includes("dispatchAutomationRuns");
  } catch {
    // Keep flags false — probe reports unavailable.
  }

  flagChecks.push(
    { id: "stripe_claim_before_process", ok: stripeClaimBeforeProcess },
    { id: "stripe_claim_lease", ok: stripeClaimLease },
    { id: "stripe_claim_fail_closed", ok: stripeClaimFailClosed },
    { id: "work_queue_reclaim_guard", ok: workQueueReclaimGuard },
    { id: "x_post_no_retry", ok: xPostNoRetry },
    { id: "v2_prod_dispatch_guard", ok: v2ProdDispatchDisabled },
  );

  // Runtime endpoint safety (authz / billing surfaces remain denied).
  const surfacePaths = [
    "/api/automations/tick",
    "/api/billing/checkout",
    "/api/worker/drain",
  ];
  const surfaces = await Promise.all(
    surfacePaths.map(async (path) => {
      try {
        const response = await fetch(`${origin}${path}`, {
          method: "POST",
          redirect: "manual",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
          body: "{}",
        });
        const text = await response.text().catch(() => "");
        const denied =
          response.status === 401 ||
          response.status === 403 ||
          response.status === 404 ||
          response.status === 503;
        return {
          path,
          status: response.status,
          denied,
          bodySafe: assertNoSecretMaterial(text),
        };
      } catch {
        return { path, status: 0, denied: false, bodySafe: false };
      }
    }),
  );

  const flagsOk = flagChecks.every((c) => c.ok);
  const surfacesOk = surfaces.every((s) => s.denied && s.bodySafe);
  const ok = flagsOk && surfacesOk;
  const version = getHealthVersionPayload();

  const body = {
    ...toPublicHealthResponse({ ok }, { cached: false }),
    flags: flagChecks,
    flagsOk,
    surfaces: surfaces.map(({ path, status, denied, bodySafe }) => ({
      path,
      status,
      denied,
      bodySafe,
    })),
    surfacesOk,
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };

  return Response.json(body, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
