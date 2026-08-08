import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { assertNoSecretMaterial } from "@/lib/security/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * P0-04 production evidence probe (public, safe flags only).
 * Confirms common error/auth surfaces do not emit secret-like material.
 * Never returns secret values or env contents.
 */

type ProbeResult = {
  path: string;
  status: number;
  bodySafe: boolean;
  denied: boolean;
};

function isDeniedStatus(status: number, path: string): boolean {
  if (status === 401 || status === 403 || status === 404) return true;
  // Cron/tick fail-closed when secret missing or invalid.
  if (status === 503 && path.includes("/api/automations/tick")) return true;
  return false;
}

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
    const text = await response.text().catch(() => "");
    const bodySafe = assertNoSecretMaterial(text);
    return {
      path,
      status,
      bodySafe,
      denied: isDeniedStatus(status, path),
    };
  } catch {
    return { path, status: 0, bodySafe: false, denied: false };
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  const checks = await Promise.all([
    probe(origin, "/api/knowledge"),
    probe(origin, "/api/integrations"),
    probe(origin, "/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
    probe(origin, "/api/vision/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
    probe(origin, "/api/automations/tick", {
      method: "POST",
      headers: {
        Authorization: "Bearer not-a-real-cron-secret",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    probe(origin, "/api/health/oauth-encryption?apply=1"),
    probe(origin, "/api/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "p0-04-probe" }),
    }),
  ]);

  const allBodiesSafe = checks.every((item) => item.bodySafe);
  const authDenied = checks
    .filter((item) =>
      [
        "/api/knowledge",
        "/api/integrations",
        "/api/billing/checkout",
        "/api/automations/tick",
        "/api/health/oauth-encryption?apply=1",
      ].some((p) => item.path === p || item.path.endsWith(p)),
    )
    .every((item) => item.denied);

  const ok = allBodiesSafe && authDenied;
  const version = getHealthVersionPayload();

  const body = {
    ...toPublicHealthResponse({ ok }, { cached: false }),
    checks: checks.map(({ path, status, bodySafe, denied }) => ({
      path,
      status,
      bodySafe,
      denied,
    })),
    allBodiesSafe,
    authDenied,
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };

  return Response.json(body, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
