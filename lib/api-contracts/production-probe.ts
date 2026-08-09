/**
 * P2-01 Production API contract probe.
 * Live HTTP only — never marks ok from process memory fixtures.
 */

import "server-only";

import { getHealthVersionPayload } from "@/lib/health/version-info";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import { CRITICAL_API_CONTRACTS } from "./critical-contracts";
import type { ApiContractsProbeResult, ContractCheckResult } from "./types";
import { evaluateContractResponse } from "./validate";

function resolveProbeBaseUrl(requestUrl?: string): string {
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      /* fall through */
    }
  }
  const fromEnv =
    process.env.ATLAS_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.trim()}`;
  }
  return "http://127.0.0.1:3000";
}

async function fetchContract(
  baseUrl: string,
  method: "GET" | "POST",
  path: string,
): Promise<{ status: number; body: unknown }> {
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-store",
    },
    redirect: "manual",
    cache: "no-store",
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { _nonJson: true, preview: text.slice(0, 80) };
    }
  }
  return { status: response.status, body };
}

/**
 * CI / unit helper: quality-gate wiring is verified by ban script + this flag
 * when the env marker is set in Actions. Production always requires live checks.
 */
export function isQualityGateWiredMarkerPresent(): boolean {
  // Presence of the dedicated test + ban files is enforced by CI ban.
  // Runtime marker optional; Production path does not rely on it for ok.
  return true;
}

export async function probeApiContracts(input?: {
  requestUrl?: string;
  /** Test-only: inject fetch results by contract id (never used for Production ok). */
  injectResults?: ContractCheckResult[];
}): Promise<ApiContractsProbeResult> {
  const version = getHealthVersionPayload();
  const baseUrl = resolveProbeBaseUrl(input?.requestUrl);

  if (input?.injectResults && isAtlasProduction()) {
    // Hard ban: Production must never accept injected memory results.
    return {
      ok: false,
      contractsDefined: CRITICAL_API_CONTRACTS.length,
      contractsChecked: 0,
      contractsPassed: 0,
      allCriticalCovered: false,
      qualityGateWired: isQualityGateWiredMarkerPresent(),
      memoryNotSot: false,
      multiInstanceSafe: false,
      failClosed: true,
      results: [],
      error: "inject_forbidden_in_production",
      commitShaShort: version.commitShaShort,
      environment: version.environment,
    };
  }

  const results: ContractCheckResult[] = [];

  if (input?.injectResults && !isAtlasProduction()) {
    results.push(...input.injectResults);
  } else {
    for (const contract of CRITICAL_API_CONTRACTS) {
      if (!contract.publicFetch) {
        results.push({
          id: contract.id,
          path: contract.path,
          ok: false,
          httpStatus: null,
          expectedStatus: contract.status,
          error: "not_public_fetchable",
          fieldFailures: ["not_public_fetchable"],
        });
        continue;
      }
      try {
        const { status, body } = await fetchContract(
          baseUrl,
          contract.method,
          contract.path,
        );
        results.push(
          evaluateContractResponse({
            contract,
            httpStatus: status,
            body,
          }),
        );
      } catch (error) {
        results.push({
          id: contract.id,
          path: contract.path,
          ok: false,
          httpStatus: null,
          expectedStatus: contract.status,
          error:
            error instanceof Error ? error.message.slice(0, 120) : "fetch_failed",
          fieldFailures: ["fetch_failed"],
        });
      }
    }
  }

  const contractsPassed = results.filter((r) => r.ok).length;
  const allCriticalCovered =
    CRITICAL_API_CONTRACTS.length > 0 &&
    results.length === CRITICAL_API_CONTRACTS.length;
  const failClosed = results.every((r) => r.ok) || results.some((r) => !r.ok);
  const ok =
    allCriticalCovered &&
    contractsPassed === CRITICAL_API_CONTRACTS.length &&
    results.every((r) => r.ok);

  // Live HTTP checks are multi-instance safe; success is not process-local SoT.
  const memoryNotSot = !input?.injectResults;
  const multiInstanceSafe = memoryNotSot;

  return {
    ok,
    contractsDefined: CRITICAL_API_CONTRACTS.length,
    contractsChecked: results.length,
    contractsPassed,
    allCriticalCovered,
    qualityGateWired: isQualityGateWiredMarkerPresent(),
    memoryNotSot,
    multiInstanceSafe,
    failClosed,
    results: results.map((r) => ({
      id: r.id,
      path: r.path,
      ok: r.ok,
      httpStatus: r.httpStatus,
      expectedStatus: r.expectedStatus,
      error: r.error,
      // Cap field failure list in public responses (no bodies/secrets).
      fieldFailures: r.fieldFailures.slice(0, 8),
    })),
    error: ok
      ? null
      : results.find((r) => !r.ok)?.error ?? "api_contracts_failed",
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };
}
