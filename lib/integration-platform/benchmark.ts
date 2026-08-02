/**
 * 100-call measured benchmark per service (sandbox by default).
 * Never labels sandbox results as live production traffic.
 */

import { getAdapter } from "@/lib/integration-platform/registry";
import {
  computeServiceMetrics,
  recordIntegrationCall,
  resetIntegrationMetricsForTests,
} from "@/lib/integration-platform/metrics";
import { classifyError } from "@/lib/integration-platform/retry-policy";
import type {
  IntegrationServiceId,
  IntegrationServiceMetrics,
} from "@/lib/integration-platform/types";

export type BenchmarkReport = {
  services: IntegrationServiceMetrics[];
  callsPerService: number;
  sandbox: true;
  kind: "measured";
};

const BENCH_SERVICES: IntegrationServiceId[] = [
  "google_drive",
  "dropbox",
  "x",
  "wordpress",
  "gmail",
  "google_calendar",
  "line",
  "supabase_storage",
];

function actionFor(serviceId: IntegrationServiceId): string {
  switch (serviceId) {
    case "x":
      return "x_post";
    case "wordpress":
      return "wordpress_post";
    case "gmail":
      return "send_email";
    case "google_calendar":
      return "calendar_event";
    case "line":
      return "line_push";
    case "google_drive":
    case "dropbox":
    case "supabase_storage":
      return "upload";
    default:
      return "upload";
  }
}

export async function runIntegrationBenchmark100(input?: {
  ownerId?: string;
  services?: IntegrationServiceId[];
  callsPerService?: number;
  reset?: boolean;
}): Promise<BenchmarkReport> {
  const ownerId = input?.ownerId ?? "benchmark-owner";
  const services = input?.services ?? BENCH_SERVICES;
  const calls = input?.callsPerService ?? 100;
  if (input?.reset !== false) {
    resetIntegrationMetricsForTests();
  }

  for (const serviceId of services) {
    const adapter = getAdapter(serviceId);
    await adapter.connect(ownerId);
    for (let i = 0; i < calls; i += 1) {
      const started = Date.now();
      let statusCode: number | null = null;
      let ok = false;
      let retried = false;
      let retryCount = 0;
      try {
        const result = await adapter.execute({
          ownerId,
          action: actionFor(serviceId),
          payload: {
            fileName: `bench-${serviceId}-${i}.bin`,
            content: `payload-${serviceId}-${i}`,
            buffer: Buffer.from(`payload-${serviceId}-${i}`, "utf8"),
            text: `bench post ${i}`,
          },
          requireVerification: true,
          idempotencyKey: `${serviceId}-${i}`,
        });
        ok = result.ok && result.verified;
        retried = result.retried;
        retryCount = Math.max(0, result.attempts - 1);
        statusCode = ok ? 200 : 500;
        recordIntegrationCall({
          serviceId,
          action: actionFor(serviceId),
          ok,
          durationMs: result.durationMs || Date.now() - started,
          statusCode,
          retried,
          retryCount,
          classification: ok ? "non_retryable_other" : "retryable_5xx",
          at: new Date().toISOString(),
          sandbox: true,
        });
      } catch (error) {
        const classification = classifyError(error);
        recordIntegrationCall({
          serviceId,
          action: actionFor(serviceId),
          ok: false,
          durationMs: Date.now() - started,
          statusCode: statusCode,
          retried,
          retryCount,
          classification,
          at: new Date().toISOString(),
          sandbox: true,
        });
      }
    }
  }

  return {
    services: services.map((serviceId) =>
      computeServiceMetrics(serviceId, { sandbox: true }),
    ),
    callsPerService: calls,
    sandbox: true,
    kind: "measured",
  };
}
