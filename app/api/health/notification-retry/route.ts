import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * P1-02: Notification retry/DLQ readiness + tick wiring probe.
 * Read-only public flags. apply=1 unused (no DDL apply in this probe).
 */

let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 30_000;

function isMissing(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the table/i.test(message),
  );
}

function tickWiredFromSource(): boolean {
  try {
    const src = readFileSync(
      join(process.cwd(), "app/api/automations/tick/route.ts"),
      "utf8",
    );
    return (
      src.includes("processDurableNotificationRetries") &&
      src.includes("notificationRetries")
    );
  } catch {
    return false;
  }
}

async function probe() {
  const version = getHealthVersionPayload();
  const tickWired = tickWiredFromSource();
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      ok: false,
      inboxTableOk: false,
      dlqTableOk: false,
      tickWired,
      retryDrainReady: false,
      memoryNotSot: true,
      error: "supabase_service_role_not_configured",
      version,
    };
  }

  const { error: inboxError } = await client
    .from("atlas_user_notifications")
    .select("notification_id, status, next_retry_at")
    .limit(1);
  // Unexpected errors still mean table is present; missing table → not ok.
  const inboxPresent = !inboxError || !isMissing(inboxError.message);

  const { error: dlqError } = await client
    .from("atlas_notification_dlq")
    .select("id, status")
    .limit(1);
  const dlqPresent = !dlqError || !isMissing(dlqError.message);

  const ok = inboxPresent && dlqPresent && tickWired;
  return {
    ok,
    inboxTableOk: inboxPresent,
    dlqTableOk: dlqPresent,
    tickWired,
    retryDrainReady: ok,
    memoryNotSot: true,
    error: ok
      ? null
      : inboxError?.message ??
        dlqError?.message ??
        (!tickWired ? "tick_not_wired" : "unavailable"),
    version,
  };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const apply = url.searchParams.get("apply") === "1";

  if (apply) {
    const gate = await authorizeHealthProbe(request);
    if (!gate.ok) return healthUnauthorizedResponse(gate);
  }

  const now = Date.now();
  if (!force && !apply && lastSafeBody && now - lastRunAtMs < MIN_INTERVAL_MS) {
    return Response.json(
      {
        ...lastSafeBody,
        ...toPublicHealthResponse({ ok: lastOk }, { cached: true }),
      },
      {
        status: lastOk ? 200 : 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  const result = await probe();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    inboxTableOk: result.inboxTableOk,
    dlqTableOk: result.dlqTableOk,
    tickWired: result.tickWired,
    retryDrainReady: result.retryDrainReady,
    memoryNotSot: result.memoryNotSot,
    commitShaShort: result.version.commitShaShort,
    environment: result.version.environment,
  };
  lastSafeBody = body;

  console.info("[health/notification-retry]", {
    ok: result.ok,
    inboxTableOk: result.inboxTableOk,
    dlqTableOk: result.dlqTableOk,
    tickWired: result.tickWired,
    error: result.error,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
