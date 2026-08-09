/**
 * P2-01 critical API contracts (47/100 #19 → 重要API).
 * Focus: Production reliability surfaces from P0/P1 + auth fail-closed.
 * Not a full OpenAPI of all ~238 routes — intentional scope.
 */

import type { ApiContract } from "./types";

const healthOkFields = {
  ok: { type: "boolean" as const },
};

/** Unauthorized tick / cron surfaces — never succeed anonymously in Production. */
const unauthorizedErrorFields = {
  error: { type: "string" as const, enum: ["Unauthorized"] },
};

/**
 * Canonical critical set. Adding a Production-critical public health probe
 * here is required when introducing new P0/P1 durability surfaces.
 */
export const CRITICAL_API_CONTRACTS: readonly ApiContract[] = [
  {
    id: "health.version",
    method: "GET",
    path: "/api/health/version",
    status: 200,
    publicFetch: true,
    criticalReason: "Deployment identity / SHA proof",
    fields: {
      ok: { type: "boolean", enum: [true] },
      environment: { type: "string" },
      commitSha: { type: "string" },
      commitShaShort: { type: "string" },
      buildTime: { type: "string" },
      appVersion: { type: "string" },
    },
  },
  {
    id: "health.work-queue",
    method: "GET",
    path: "/api/health/work-queue?force=1",
    status: 200,
    publicFetch: true,
    criticalReason: "Minute tick durability SoT",
    fields: {
      ...healthOkFields,
      postgresUrlConfigured: { type: "boolean" },
      tablesOk: { type: "boolean" },
      storeReady: { type: "boolean" },
      metricsOk: { type: "boolean" },
      commitShaShort: { type: "string" },
    },
  },
  {
    id: "health.pdf-tables",
    method: "GET",
    path: "/api/health/pdf-tables?force=1",
    status: 200,
    publicFetch: true,
    criticalReason: "P1-01 PDF table fail-closed",
    fields: {
      ...healthOkFields,
      tablesRendered: { type: "boolean" },
      commitShaShort: { type: "string" },
    },
  },
  {
    id: "health.notification-retry",
    method: "GET",
    path: "/api/health/notification-retry?force=1",
    status: 200,
    publicFetch: true,
    criticalReason: "P1-02 notification retry drain",
    fields: {
      ...healthOkFields,
      retryDrainReady: { type: "boolean" },
      tickWired: { type: "boolean" },
      commitShaShort: { type: "string" },
    },
  },
  {
    id: "health.automation-v2-db",
    method: "GET",
    path: "/api/health/automation-v2-db?force=1",
    status: 200,
    publicFetch: true,
    criticalReason: "P1-03 automation V2 DB SoT",
    fields: {
      ...healthOkFields,
      dbSotReady: { type: "boolean" },
      commitShaShort: { type: "string" },
    },
  },
  {
    id: "health.side-effect-idempotency",
    method: "GET",
    path: "/api/health/side-effect-idempotency?force=1",
    status: 200,
    publicFetch: true,
    criticalReason: "P1-04 side-effect idempotency",
    fields: {
      ...healthOkFields,
      durableIdempotencyReady: { type: "boolean" },
      commitShaShort: { type: "string" },
    },
  },
  {
    id: "health.household-ledger",
    method: "GET",
    path: "/api/health/household-ledger?force=1",
    status: 200,
    publicFetch: true,
    criticalReason: "P1-05 household ledger DB SoT",
    fields: {
      ...healthOkFields,
      dbSotReady: { type: "boolean" },
      ownershipOk: { type: "boolean" },
      commitShaShort: { type: "string" },
    },
  },
  {
    id: "health.rate-limit",
    method: "GET",
    path: "/api/health/rate-limit?force=1",
    status: 200,
    publicFetch: true,
    criticalReason: "P1-06 distributed rate limit",
    fields: {
      ...healthOkFields,
      dbSotReady: { type: "boolean" },
      consumeRpcOk: { type: "boolean" },
      commitShaShort: { type: "string" },
    },
  },
  {
    id: "health.external-monitor",
    method: "GET",
    path: "/api/health/external-monitor?force=1",
    status: 200,
    publicFetch: true,
    criticalReason: "P1-07 external monitor readiness",
    fields: {
      ...healthOkFields,
      durableReady: { type: "boolean" },
      tickWired: { type: "boolean" },
      commitShaShort: { type: "string" },
    },
  },
  {
    id: "health.deliverable-quality",
    method: "GET",
    path: "/api/health/deliverable-quality?force=1",
    status: 200,
    publicFetch: true,
    criticalReason: "P1-08 deliverable practical quality",
    fields: {
      ...healthOkFields,
      excelNumFmtOk: { type: "boolean" },
      pptxTableOk: { type: "boolean" },
      wordImageEmbedOk: { type: "boolean" },
      commitShaShort: { type: "string" },
    },
  },
  {
    id: "health.content-quality-gate",
    method: "GET",
    path: "/api/health/content-quality-gate?force=1",
    status: 200,
    publicFetch: true,
    criticalReason: "P2-02 unified non-Word content quality gate",
    fields: {
      ...healthOkFields,
      commonGateOk: { type: "boolean" },
      nonWordFormatsGated: { type: "boolean" },
      formatSpecificOk: { type: "boolean" },
      engineNonWordPathGated: { type: "boolean" },
      failClosedOnGarbage: { type: "boolean" },
      commitShaShort: { type: "string" },
    },
  },
  {
    id: "health.worker-scale",
    method: "GET",
    path: "/api/health/worker-scale?force=1",
    status: 200,
    publicFetch: true,
    criticalReason: "P2-03 worker horizontal scale",
    fields: {
      ...healthOkFields,
      minutePathPresent: { type: "boolean" },
      claimLimitReviewed: { type: "boolean" },
      horizontalDrainWired: { type: "boolean" },
      backpressureConfigured: { type: "boolean" },
      multiWorkerLeaseOk: { type: "boolean" },
      horizontalDrainOk: { type: "boolean" },
      commitShaShort: { type: "string" },
    },
  },
  {
    id: "health.structured-logs",
    method: "GET",
    path: "/api/health/structured-logs?force=1",
    status: 200,
    publicFetch: true,
    criticalReason: "P2-04 correlation-tagged structured logs durability",
    fields: {
      ...healthOkFields,
      tableOk: { type: "boolean" },
      correlationPresent: { type: "boolean" },
      durableWriteOk: { type: "boolean" },
      durableReadOk: { type: "boolean" },
      restartDurableOk: { type: "boolean" },
      multiInstanceOk: { type: "boolean" },
      memoryNotSot: { type: "boolean" },
      commitShaShort: { type: "string" },
    },
  },
  {
    id: "health.ocr-engine",
    method: "GET",
    path: "/api/health/ocr-engine?force=1",
    status: 200,
    publicFetch: true,
    criticalReason: "P2-05 OCR dedicated-engine evaluation",
    fields: {
      ...healthOkFields,
      evaluationComplete: { type: "boolean" },
      visionOcrPathPresent: { type: "boolean" },
      accuracyGateOk: { type: "boolean" },
      dedicatedEnginePolicyOk: { type: "boolean" },
      restartDurableOk: { type: "boolean" },
      retrySafe: { type: "boolean" },
      multiInstanceSafe: { type: "boolean" },
      memoryNotSot: { type: "boolean" },
      ownershipIsolationOk: { type: "boolean" },
      commitShaShort: { type: "string" },
    },
  },
  {
    id: "health.billing-schema",
    method: "GET",
    path: "/api/health/billing-schema?force=1",
    status: 200,
    publicFetch: true,
    criticalReason: "P0 billing durability",
    fields: {
      ...healthOkFields,
      subscriptionsTableOk: { type: "boolean" },
      commitShaShort: { type: "string" },
    },
  },
  {
    id: "automations.tick.unauthorized",
    method: "POST",
    path: "/api/automations/tick",
    status: 401,
    publicFetch: true,
    criticalReason: "Tick must fail-closed without CRON_SECRET",
    fields: unauthorizedErrorFields,
  },
  {
    id: "worker.drain.unauthorized",
    method: "POST",
    path: "/api/worker/drain",
    status: 401,
    publicFetch: true,
    criticalReason: "P2-03 drain fan-out must fail-closed without CRON_SECRET",
    fields: unauthorizedErrorFields,
  },
  {
    id: "automations.list.unauthorized",
    method: "GET",
    path: "/api/automations",
    status: 401,
    publicFetch: true,
    criticalReason: "User automations must not leak without session",
    // Production hits Clerk/proxy before the route; body is { error: "Unauthorized" }.
    fields: unauthorizedErrorFields,
  },
] as const;

export const CRITICAL_CONTRACT_IDS = CRITICAL_API_CONTRACTS.map((c) => c.id);

export function getCriticalContractById(id: string): ApiContract | undefined {
  return CRITICAL_API_CONTRACTS.find((c) => c.id === id);
}
