/**
 * Representative ¥980 Light use case:
 * 新規ユーザーが「毎週レポート（Word）」自動化を作り、手動実行で実成果物URLを得る。
 *
 * This is an integration test of the wiring (not a browser E2E).
 * generateDeliverables is mocked at the engine boundary; the invoker must still
 * refuse url:null success and surface download URLs on the run.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "clerk"),
  loadDurableDomain: vi.fn(async () => null),
}));
vi.mock("@/lib/automation-platform/bridge/v2-to-v1-scheduler", () => ({
  syncV2ToV1Scheduler: vi.fn(async (automation: { id: string }) => ({
    v1Id: `v1-${automation.id}`,
    registered: true,
  })),
}));
vi.mock("@/lib/notifications/service", () => ({
  createNotification: vi.fn(() => ({ notificationId: "n_weekly" })),
}));

const generateDeliverables = vi.fn();
vi.mock("@/lib/deliverables/engine", () => ({
  generateDeliverables: (...args: unknown[]) => generateDeliverables(...args),
}));
vi.mock("@/lib/billing/stripe/config", () => ({
  resolveAppOrigin: (fallback: string) =>
    fallback.replace(/\/$/, "") || "http://localhost:3000",
}));

import { resetAutomationAuditLogForTests } from "@/lib/automation-platform/audit/log";
import { resetAutomationPlatformStoreForTests } from "@/lib/automation-platform/repository/memory-store";
import { resetAutomationRateLimitForTests } from "@/lib/automation-platform/security/rate-limit";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import {
  resetFeatureFlagStore,
  setFeatureFlagState,
} from "@/lib/feature-flags/store";
import { evaluateCompletionEvidence } from "@/lib/jobs/completion-evidence";

const ownerContext = buildFeatureAccessContext("owner@example.com");

describe("weekly report critical path (¥980 Light)", () => {
  beforeEach(() => {
    resetAutomationPlatformStoreForTests();
    resetAutomationAuditLogForTests();
    resetAutomationRateLimitForTests();
    resetFeatureFlagStore();
    setFeatureFlagState("automation_v2_enabled", "on");
    generateDeliverables.mockReset();
    delete process.env.ATLAS_V2_REAL_DELIVERABLES;
  });

  it("create → run now → real Word download URL (no fake success)", async () => {
    generateDeliverables.mockResolvedValue({
      deliverables: [
        {
          id: "dlv_weekly_1",
          fileName: "週次営業報告書.docx",
          format: "docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          generatedAt: new Date().toISOString(),
          sizeBytes: 4096,
          isPlaceholder: false,
          downloadUrl: "http://localhost:3000/api/deliverables/dlv_weekly_1",
        },
      ],
      detection: { formats: ["docx", "pdf"], matchedRule: "forced" },
      failures: [],
      jobId: "job_weekly_1",
    });

    const automation = await automationPlatformService.create(
      "user_light_1",
      {
        name: "毎週営業レポート",
        description: "毎週月曜に営業報告書をWordで作成",
        status: "active",
        instruction: {
          freeformNotes:
            "今週の商談件数・受注見込み・来週の重点顧客をまとめた週次営業報告書を作成してください。",
          structuredOptions: { generatePdf: true },
        },
        trigger: {
          type: "schedule",
          timezone: "Asia/Tokyo",
          schedule: {
            frequency: "weekly",
            hour: 9,
            minute: 0,
            daysOfWeek: [1],
          },
          event: null,
          condition: null,
        },
        workflow: {
          version: 1,
          steps: [
            {
              id: "word1",
              type: "word_generate",
              name: "週次報告書",
              order: 1,
              inputBindings: {},
              configuration: {
                title: "週次営業報告書",
                documentType: "report",
                tone: "formal",
              },
              requiresApproval: false,
              retryPolicy: { maxAttempts: 2, backoffMs: [1000] },
              timeoutMs: 60_000,
              onSuccess: null,
              onFailure: null,
              enabled: true,
            },
          ],
          onFailure: { strategy: "stop", notify: true },
          timeoutPolicy: {
            workflowTimeoutMs: 120_000,
            stepDefaultTimeoutMs: 60_000,
          },
        },
        executionPolicy: { mode: "run_then_notify" },
      },
      ownerContext,
    );

    const { run, created } = await automationPlatformService.enqueueRun({
      userId: "user_light_1",
      automationId: automation.id,
      triggerType: "manual",
      context: ownerContext,
      requestOrigin: "http://localhost:3000",
    });

    expect(created).toBe(true);
    expect(run.status).toBe("succeeded");
    expect(run.artifacts.length).toBeGreaterThan(0);
    expect(run.artifacts.every((a) => a.url && a.url.length > 0)).toBe(true);
    expect(run.artifacts[0]?.url).toContain("/api/deliverables/");
    expect(generateDeliverables).toHaveBeenCalled();

    const evidence = evaluateCompletionEvidence({
      orchestrationStatus: "completed",
      approved: true,
      deliverableCount: run.artifacts.length,
      snsPostFailure: null,
      storageUrl: run.artifacts[0]?.url ?? null,
      artifactId: run.artifacts[0]?.id ?? null,
      deliverablesExpected: true,
    });
    expect(evidence.status).toBe("completed");
  });

  it("never marks empty deliverable run as completed when files were expected", () => {
    const evidence = evaluateCompletionEvidence({
      orchestrationStatus: "completed",
      approved: true,
      deliverableCount: 0,
      snsPostFailure: null,
      deliverablesExpected: true,
    });
    expect(evidence.status).toBe("failed");
  });
});
