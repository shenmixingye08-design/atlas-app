import "server-only";

import { authorizeAutomationTick } from "@/lib/automations/tick-auth";

import { healthAuthFailedStatus } from "./public-health-response";

/**
 * P07/P08: Dangerous health probes (OpenAI spend, schema apply, pipeline smoke)
 * must not be anonymous on the public internet.
 * Same gate as automation tick: Bearer CRON_SECRET or ATLAS owner (prod).
 */
export async function authorizeHealthProbe(
  request: Request,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const gate = await authorizeAutomationTick(request);
  if (gate.ok) return gate;
  return {
    ok: false,
    status: healthAuthFailedStatus(gate.status),
    error: "Unauthorized",
  };
}

export function healthUnauthorizedResponse(
  gate: { ok: false; status: number; error: string },
): Response {
  const status = healthAuthFailedStatus(gate.status);
  return Response.json(
    { ok: false, status: "unauthorized", error: "Unauthorized" },
    {
      status: status === 403 ? 403 : 401,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
