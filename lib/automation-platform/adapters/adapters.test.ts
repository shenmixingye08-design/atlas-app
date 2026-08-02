import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  loadDurableDomain: vi.fn(async () => null),
  persistDurableDomain: vi.fn(async () => undefined),
}));
vi.mock("@/lib/deliverables", async () => {
  const actual = await vi.importActual<typeof import("@/lib/deliverables")>(
    "@/lib/deliverables",
  );
  return {
    ...actual,
    generateDeliverables: vi.fn(async (input, _origin, options) => {
      const format = input.formats?.[0] ?? "docx";
      return {
        deliverables: [
          {
            id: `dlv_${format}_live`,
            fileName: `live.${format}`,
            format,
            mimeType: "application/octet-stream",
            generatedAt: new Date().toISOString(),
            sizeBytes: 4096,
            isPlaceholder: false,
            downloadUrl: `/api/deliverables/dlv_${format}_live`,
          },
        ],
        detection: { formats: [format], matchedRule: "test" },
        failures: [],
        jobId: options.jobId ?? "job_live",
      };
    }),
  };
});

import {
  getLiveStepAdapter,
  listLiveStepAdapterTypes,
  missingAdapterResult,
  UNWIRED_LIVE_CAPABILITIES,
} from "@/lib/automation-platform/adapters/registry";
import { toStepInvokeResult } from "@/lib/automation-platform/adapters/result-map";
import { diagnoseAutomationLiveEnvironment } from "@/lib/automation-platform/adapters/env-diagnostics";
import {
  buildArtifactGenerationKey,
  buildExternalActionKey,
  resetAutomationIdempotencyForTests,
  reserveIdempotencyKey,
  completeIdempotencyRecord,
} from "@/lib/automation-platform/adapters/idempotency-store";
import { AUTOMATION_V2_CAPABILITY_MATRIX } from "@/lib/automation-platform/adapters/capability-matrix";
import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import { preflightAutomationActivation } from "@/lib/automation-platform/adapters/preflight";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import { DEFAULT_EXECUTION_POLICY } from "@/lib/automation-platform/types/execution-policy";
import { DEFAULT_NOTIFICATION_POLICY } from "@/lib/automation-platform/types/notification-policy";
import { DEFAULT_MEMORY_POLICY } from "@/lib/automation-platform/types/memory-policy";
import { DEFAULT_INSTRUCTION } from "@/lib/automation-platform/types/instruction";

function sampleAutomation(
  overrides: Partial<AutomationV2> = {},
): AutomationV2 {
  const now = new Date().toISOString();
  return {
    id: "auto_live_1",
    userId: "user_a",
    name: "Live Word",
    description: "",
    status: "draft",
    schemaVersion: 2,
    legacyAutomationId: null,
    trigger: {
      type: "manual",
      timezone: "Asia/Tokyo",
      schedule: null,
      event: null,
      condition: null,
    },
    workflow: {
      version: 1,
      steps: [
        {
          id: "step_word",
          type: "word_generate",
          name: "Word生成",
          order: 0,
          inputBindings: {},
          configuration: { content: "週次レポート本文です。" },
          requiresApproval: false,
          retryPolicy: { maxAttempts: 1, backoffMs: [1000] },
          timeoutMs: 60_000,
          onSuccess: null,
          onFailure: null,
          enabled: true,
        },
      ],
      onFailure: { strategy: "stop", notify: true },
      timeoutPolicy: {
        workflowTimeoutMs: 600_000,
        stepDefaultTimeoutMs: 120_000,
      },
    },
    executionPolicy: DEFAULT_EXECUTION_POLICY,
    notificationPolicy: DEFAULT_NOTIFICATION_POLICY,
    instruction: {
      ...DEFAULT_INSTRUCTION,
      freeformNotes: "週次レポート本文です。",
      structuredOptions: { assignment: "週次レポートを作成" },
    },
    memoryPolicy: DEFAULT_MEMORY_POLICY,
    nextRunAt: null,
    lastRunAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("live adapter registry", () => {
  afterEach(() => {
    resetAutomationIdempotencyForTests();
    resetFeatureFlagStore();
    vi.unstubAllEnvs();
  });

  it("registers core live adapters", () => {
    const types = listLiveStepAdapterTypes();
    expect(types).toContain("word_generate");
    expect(types).toContain("excel_generate");
    expect(types).toContain("pdf_generate");
    expect(types).toContain("powerpoint_generate");
    expect(types).toContain("x_post");
    expect(types).toContain("gmail");
    expect(types).toContain("dropbox");
    expect(types).toContain("notify");
    expect(getLiveStepAdapter("orchestrate")).toBeNull();
  });

  it("fail-closes missing adapters", () => {
    const result = toStepInvokeResult(missingAdapterResult("orchestrate"));
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("automation_unsupported_step");
  });

  it("persists idempotency reservation and completion", async () => {
    const key = buildExternalActionKey({
      automationId: "a1",
      occurrenceKey: "occ1",
      stepId: "s1",
      action: "x_post",
    });
    const first = await reserveIdempotencyKey({
      userId: "user_a",
      key,
      kind: "external_action",
      runId: "r1",
      stepId: "s1",
    });
    expect(first.created).toBe(true);
    await completeIdempotencyRecord({
      userId: "user_a",
      key,
      externalActionId: "tw_1",
    });
    const second = await reserveIdempotencyKey({
      userId: "user_a",
      key,
      kind: "external_action",
    });
    expect(second.created).toBe(false);
    expect(second.record.externalActionId).toBe("tw_1");
    expect(buildArtifactGenerationKey({
      runId: "r1",
      stepId: "s1",
      attempt: 1,
      format: "docx",
    })).toContain("art:r1:s1:1:docx");
  });

  it("diagnoses environment without leaking secrets", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("AUTOMATION_E2E_LIVE_EXTERNAL", "false");
    const items = diagnoseAutomationLiveEnvironment();
    expect(items.find((i) => i.id === "openai")?.status).toBe("configured");
    expect(items.find((i) => i.id === "live_external_flag")?.status).toBe(
      "missing",
    );
    expect(JSON.stringify(items)).not.toContain("sk-test");
  });

  it("preflight allows word-only automation when content present", async () => {
    setFeatureFlagState("automation_v2_enabled", "on");
    const result = await preflightAutomationActivation({
      automation: sampleAutomation(),
      access: buildFeatureAccessContext("user@example.com"),
    });
    expect(result.ok).toBe(true);
  });

  it("documents capability matrix and unwired orchestrate", () => {
    expect(AUTOMATION_V2_CAPABILITY_MATRIX.length).toBeGreaterThan(10);
    expect(UNWIRED_LIVE_CAPABILITIES).toContain("orchestrate");
    expect(
      AUTOMATION_V2_CAPABILITY_MATRIX.find((r) => r.stepType === "orchestrate")
        ?.connectedFromAutomationV2,
    ).toBe(false);
  });

  it("word/excel/pdf/pptx live adapters generate real-sized artifacts", async () => {
    const access = buildFeatureAccessContext("owner@example.com");
    for (const type of [
      "word_generate",
      "excel_generate",
      "pdf_generate",
      "powerpoint_generate",
    ] as const) {
      const adapter = getLiveStepAdapter(type);
      expect(adapter).toBeTruthy();
      const result = await adapter!.execute({
        step: {
          id: `s_${type}`,
          type,
          name: type,
          order: 0,
          inputBindings: {},
          configuration: { content: "本文です" },
          requiresApproval: false,
          retryPolicy: { maxAttempts: 1, backoffMs: [] },
          timeoutMs: 60_000,
          onSuccess: null,
          onFailure: null,
          enabled: true,
        },
        userId: "user_a",
        automationId: "auto_1",
        automationName: "Live",
        runId: `run_${type}`,
        attempt: 1,
        approved: true,
        priorArtifacts: [],
        instructionText: "本文です",
        freeformNotes: "",
        structuredOptions: {},
        access,
        occurrenceKey: null,
      });
      expect(result.status).toBe("succeeded");
      expect(result.artifacts[0]?.sizeBytes).toBeGreaterThan(0);
      expect(result.artifacts[0]?.url).toMatch(/\/api\/deliverables\//);
    }
  });

  it("preflight rejects x_post without connection", async () => {
    setFeatureFlagState("automation_v2_enabled", "on");
    setFeatureFlagState("x", "on");
    const automation = sampleAutomation({
      workflow: {
        version: 1,
        steps: [
          {
            id: "step_x",
            type: "x_post",
            name: "X投稿",
            order: 0,
            inputBindings: {},
            configuration: { text: "hello" },
            requiresApproval: true,
            retryPolicy: { maxAttempts: 1, backoffMs: [1000] },
            timeoutMs: 60_000,
            onSuccess: null,
            onFailure: null,
            enabled: true,
          },
        ],
        onFailure: { strategy: "stop", notify: true },
        timeoutPolicy: {
          workflowTimeoutMs: 600_000,
          stepDefaultTimeoutMs: 120_000,
        },
      },
    });
    const result = await preflightAutomationActivation({
      automation,
      access: buildFeatureAccessContext("user@example.com"),
    });
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (i) =>
          i.capability === "x_post" && i.code === "missing_connection",
      ),
    ).toBe(true);
  });
});
