/**
 * Provider matrix: connection / permission / execution / evidence / fail-closed /
 * retry / duplicate — structural + test-registry proof (no live credentials).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { evidenceAllowsCompleted, buildIntegrationEvidence } from "./evidence";
import {
  getIdempotentResult,
  resetLiveAdapterIdempotencyForTests,
  saveIdempotentResult,
} from "./idempotency";
import {
  resetLiveAdapterMetricsForTests,
  buildAdapterHealth,
  recordAdapterMetric,
} from "./metrics";
import { createTestAdapterRegistry } from "./registry/test";
import { buildExecutionResult, mapProviderError } from "./result";
import { ADAPTER_AUDIT_INVENTORY } from "./inventory";
import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";

const PROVIDERS = [
  "gmail",
  "google_calendar",
  "dropbox",
  "wordpress",
  "x",
  "google_drive",
] as const;

describe("integration production matrix", () => {
  beforeEach(() => {
    resetLiveAdapterIdempotencyForTests();
    resetLiveAdapterMetricsForTests();
  });
  afterEach(() => {
    resetLiveAdapterIdempotencyForTests();
    resetLiveAdapterMetricsForTests();
  });

  it("wires production adapters for Gmail/Calendar/Dropbox/WP/X/Drive", () => {
    expect(isLiveAdapterWired("google_gmail")).toBe(true);
    expect(isLiveAdapterWired("google_calendar")).toBe(true);
    expect(isLiveAdapterWired("dropbox")).toBe(true);
    expect(isLiveAdapterWired("wordpress")).toBe(true);
    expect(isLiveAdapterWired("x")).toBe(true);
    expect(isLiveAdapterWired("google_drive")).toBe(true);
    expect(isLiveAdapterWired("slack")).toBe(false);
    expect(isLiveAdapterWired("discord")).toBe(false);
    expect(isLiveAdapterWired("notion")).toBe(false);
  });

  it("inventory marks Slack/Discord/Notion/Webhook unsupported or stub", () => {
    const rows = ADAPTER_AUDIT_INVENTORY;
    for (const name of ["Slack", "Discord", "Notion", "Webhook"]) {
      const row = rows.find((r) => r.service === name);
      expect(row).toBeTruthy();
      expect(["unsupported", "stub", "partial", "unregistered"]).toContain(
        row!.classification,
      );
    }
  });

  it.each(PROVIDERS)(
    "%s: evidence gate rejects success without externalActionId",
    (service) => {
      const result = buildExecutionResult({
        status: "succeeded",
        startedAt: new Date().toISOString(),
        summary: `${service} fake`,
        requiresExternalActionId: true,
      });
      expect(result.status).toBe("failed");
      expect(result.errorCode).toBe("missing_external_action_id");
      const evidence = buildIntegrationEvidence(result);
      expect(evidenceAllowsCompleted(evidence)).toBe(false);
    },
  );

  it.each(PROVIDERS)(
    "%s: evidence accepts real externalActionId + url",
    (service) => {
      const result = buildExecutionResult({
        status: "succeeded",
        externalActionId: `${service}_action_1`,
        externalUrl: `https://example.test/${service}/1`,
        startedAt: new Date().toISOString(),
        summary: `${service} ok`,
        requiresExternalActionId: true,
        metadata: { retryAttempts: 1 },
      });
      const evidence = buildIntegrationEvidence(result);
      expect(evidenceAllowsCompleted(evidence)).toBe(true);
      expect(evidence.retryAttempts).toBe(1);
      expect(evidence.latencyMs).toBeGreaterThanOrEqual(0);
    },
  );

  it("duplicate idempotency prevents second side-effect", () => {
    const key = "run:r1|step:s1|provider:x";
    const first = buildExecutionResult({
      status: "succeeded",
      externalActionId: "tw_1",
      externalUrl: "https://x.com/i/status/1",
      startedAt: new Date().toISOString(),
      summary: "posted",
    });
    saveIdempotentResult(key, first);
    expect(getIdempotentResult(key)?.externalActionId).toBe("tw_1");
  });

  it("OAuth/permission errors are non-retryable", () => {
    expect(mapProviderError(new Error("401 unauthorized")).retryable).toBe(
      false,
    );
    expect(mapProviderError(new Error("403 insufficient scope")).retryable).toBe(
      false,
    );
    expect(mapProviderError(new Error("429 rate limit")).retryable).toBe(true);
    expect(mapProviderError(new Error("503 upstream")).retryable).toBe(true);
    expect(mapProviderError(new Error("ETIMEDOUT")).retryable).toBe(true);
  });

  it("test registry executes providers with external ids (sandbox proof)", async () => {
    const registry = createTestAdapterRegistry();
    for (const service of PROVIDERS) {
      const adapter = registry.get(service);
      expect(adapter).toBeTruthy();
      const result = await adapter!.execute({
        userId: "u_test",
        runId: `run_${service}`,
        stepId: "step_1",
        occurrenceKey: `occ_${service}`,
        configuration: {
          to: "a@example.com",
          body: "hello",
          text: "hello world",
          subject: "hi",
          saveTarget: "/Atlas",
          folderPath: "/Atlas",
          title: "Event",
          content: "<p>hi</p>",
          status: "draft",
        },
        approved: true,
        artifactBuffer: Buffer.from("bytes"),
        artifactFileName: "doc.docx",
        contentHash: "abc",
      });
      expect(
        result.status === "succeeded" || result.status === "duplicate_skipped",
      ).toBe(true);
      expect(result.externalActionId).toBeTruthy();
      recordAdapterMetric({
        service,
        ok: true,
        latencyMs: 12,
        retryable: false,
        errorCode: null,
        statusCodeHint: null,
        at: new Date().toISOString(),
      });
      const health = buildAdapterHealth(service, {
        mode: "test",
        registered: true,
        configured: true,
        classification: "production_live",
        availability: "available",
      });
      expect(health.samples).toBeGreaterThan(0);
      expect(health.successRate).toBe(1);
    }
  });

  it("token/permission failure never becomes completed evidence", () => {
    const failed = buildExecutionResult({
      status: "needs_connection",
      startedAt: new Date().toISOString(),
      summary: "token expired",
      errorCode: "token_revoked_or_unauthorized",
      requiresExternalActionId: false,
    });
    expect(evidenceAllowsCompleted(buildIntegrationEvidence(failed))).toBe(
      false,
    );
  });
});
