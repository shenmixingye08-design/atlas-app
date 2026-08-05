import "server-only";

import { authorizeAutomationTick } from "@/lib/automations/tick-auth";

/**
 * P07: Dangerous health probes (OpenAI spend, schema apply, pipeline smoke)
 * must not be anonymous on the public internet.
 * Same gate as automation tick: Bearer CRON_SECRET or ATLAS owner (prod).
 */
export async function authorizeHealthProbe(
  request: Request,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  return authorizeAutomationTick(request);
}

export function healthUnauthorizedResponse(
  gate: { ok: false; status: number; error: string },
): Response {
  return Response.json(
    { ok: false, error: gate.error },
    {
      status: gate.status,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
