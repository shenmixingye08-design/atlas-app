import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * P0-03 production evidence probe (public, safe flags only).
 * Verifies unauthenticated callers cannot reach tenant data / cron / apply paths.
 * Never returns foreign user data, tokens, or paths.
 */

type ProbeResult = {
  path: string;
  status: number;
  denied: boolean;
};

async function probe(
  origin: string,
  path: string,
  init?: RequestInit,
): Promise<ProbeResult> {
  try {
    const response = await fetch(`${origin}${path}`, {
      ...init,
      redirect: "manual",
      headers: {
        ...(init?.headers ?? {}),
        "Cache-Control": "no-store",
      },
    });
    const status = response.status;
    // 401/403/404 = authz denial. 503 on cron/tick = fail-closed when secret missing.
    const denied =
      status === 401 ||
      status === 403 ||
      status === 404 ||
      (status === 503 && path.includes("/api/automations/tick"));
    // Drain body without inspecting foreign content.
    await response.arrayBuffer().catch(() => undefined);
    return { path, status, denied };
  } catch {
    return { path, status: 0, denied: false };
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  const checks = await Promise.all([
    probe(origin, "/api/knowledge"),
    probe(origin, "/api/integrations"),
    probe(origin, "/api/integrations/does-not-exist"),
    probe(origin, "/api/marketplace"),
    probe(origin, "/api/company"),
    probe(origin, "/api/cost-optimization/summary"),
    probe(origin, "/api/automations/tick", { method: "POST" }),
    probe(origin, "/api/health/oauth-encryption?apply=1"),
    probe(origin, "/api/deliverables/00000000-0000-0000-0000-000000000000"),
  ]);

  const allDenied = checks.every((item) => item.denied);
  const version = getHealthVersionPayload();

  const body = {
    ...toPublicHealthResponse({ ok: allDenied }, { cached: false }),
    checks: checks.map(({ path, status, denied }) => ({
      path,
      status,
      denied,
    })),
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };

  return Response.json(body, {
    status: allDenied ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
