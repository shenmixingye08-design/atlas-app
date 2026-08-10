import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  applyWritingPreferenceStructure,
  buildExplicitWritingPreferenceValue,
  detectWritingPreferenceStructure,
} from "@/lib/memory-apply/preference-structure";
import {
  applyContentOverlayToText,
  buildContentOverlay,
} from "@/lib/memory-apply/overlays";
import { applyMemoryForDeliverable } from "@/lib/memory-apply/deliverables";
import { applyMemoryForAutomation } from "@/lib/memory-apply/automation";
import { FORBIDDEN_MEDIA_GENERATION_CLAIM_PATTERNS } from "@/lib/billing/plans/offered-capabilities";
import { getPlanDefinition } from "@/lib/billing/plans/registry";
import { QUICK_REQUEST_PRESETS } from "@/lib/workspace/quick-request-presets";
import { MINERVOT_DEFAULT_DESCRIPTION } from "@/lib/seo/site";
import { findUnprovenSpeedClaims } from "@/lib/marketing/unproven-speed-claims";
import { PERSONAL_MEMORY_DOMAIN_KEY } from "@/lib/personal-memory/durable";
import { SUPABASE_ONLY_DOMAIN_KEYS } from "@/lib/persistence/durable-domain";
import {
  createPersonalMemory,
  deletePersonalMemory,
  resolveForContext,
} from "@/lib/personal-memory/service";
import {
  clearAllPersonalMemoryData,
  writePersonalMemorySettings,
} from "@/lib/personal-memory/store";
import { DEFAULT_PERSONAL_MEMORY_SETTINGS } from "@/lib/personal-memory/types";
import { resetPersonalMemoryDurableForTests } from "@/lib/personal-memory/durable";
import { resetMemoryApplyMetricsForTests } from "@/lib/memory-apply/metrics";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import type { ResolvedMemoryValue } from "@/lib/personal-memory/types";

const USER = "user_n05_unit";

function sampleAutomation(userId: string): AutomationV2 {
  const now = new Date().toISOString();
  return {
    id: "auto_n05_unit",
    userId,
    name: "unit",
    description: "unit",
    status: "active",
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
          id: "s1",
          type: "word_generate",
          name: "Word",
          order: 0,
          enabled: true,
          inputBindings: {},
          configuration: {},
          requiresApproval: false,
          retryPolicy: { maxAttempts: 1, backoffMs: [0] },
          timeoutMs: 60_000,
          onSuccess: null,
          onFailure: null,
        },
      ],
      onFailure: { strategy: "stop", notify: true },
      timeoutPolicy: {
        workflowTimeoutMs: 300_000,
        stepDefaultTimeoutMs: 60_000,
      },
    },
    executionPolicy: {
      mode: "run_then_notify",
      approvalTimeoutMs: null,
      onApprovalTimeout: "cancel",
      selectedStepIds: [],
      systemHighRiskOverride: true,
    },
    notificationPolicy: {
      beforeRun: false,
      onSuccess: true,
      onFailure: true,
      onNeedsInput: true,
      channels: ["in_app"],
    },
    instruction: {
      structuredOptions: {},
      freeformNotes: "投稿文を作って",
    },
    memoryPolicy: {
      enabled: true,
      allowedScopes: ["writing_style"],
      deniedScopes: [],
      lockedOverrides: {},
    },
    legacyAutomationId: null,
    schemaVersion: 2,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: now,
    updatedAt: now,
  } as AutomationV2;
}

beforeEach(() => {
  clearAllPersonalMemoryData(USER);
  resetPersonalMemoryDurableForTests();
  resetMemoryApplyMetricsForTests();
  writePersonalMemorySettings(USER, {
    ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
    enabled: true,
  });
});

describe("N-05 memory apply production honesty", () => {
  it("keeps Personal Memory on Supabase-only domain SoT", () => {
    expect(SUPABASE_ONLY_DOMAIN_KEYS).toContain(PERSONAL_MEMORY_DOMAIN_KEY);
    expect(PERSONAL_MEMORY_DOMAIN_KEY).toBe("atlasPersonalMemory");
  });

  it("artifact overlay keeps conclusion before bullets even with headers", () => {
    const value = buildExplicitWritingPreferenceValue(
      "今後、文章は短め・箇条書き中心・結論を最初にしてください",
    );
    const rows: ResolvedMemoryValue[] = [
      {
        memoryId: "m_header",
        scope: "writing_style",
        key: "writing_preference",
        value,
        title: "文章の好み",
        summary: value.text,
        source: "explicit",
        layer: "global_memory",
        sensitivity: "normal",
      },
    ];
    const overlay = buildContentOverlay({
      values: rows,
      injectionText: "injection-header",
    });
    const text = applyContentOverlayToText(
      "長い導入です。背景です。結論は方針確定です。補足です。",
      overlay,
    );
    const conclusionIdx = text.indexOf("結論：");
    const bulletIdx = text.search(/(^|\n)- /);
    expect(conclusionIdx).toBeGreaterThanOrEqual(0);
    expect(bulletIdx).toBeGreaterThanOrEqual(0);
    expect(conclusionIdx).toBeLessThan(bulletIdx);
    expect(text).toContain("【適用する好み】");
  });

  it("detects and structurally applies short/bullets/conclusion-first", () => {
    const value = buildExplicitWritingPreferenceValue(
      "今後、文章は短め・箇条書き中心・結論を最初にしてください",
    );
    expect(value.length).toBe("short");
    expect(value.structure).toBe("bullets");
    expect(value.conclusion).toBe("first");

    const rows: ResolvedMemoryValue[] = [
      {
        memoryId: "m1",
        scope: "writing_style",
        key: "writing_preference",
        value,
        title: "文章の好み",
        summary: value.text,
        source: "explicit",
        layer: "global_memory",
        sensitivity: "normal",
      },
    ];
    const detected = detectWritingPreferenceStructure(rows);
    expect(detected.keys).toEqual(
      expect.arrayContaining([
        "length:short",
        "structure:bullets",
        "conclusion:first",
      ]),
    );

    const baseline =
      "長い導入です。背景も述べます。結論は方針を確定することです。補足もあります。";
    const applied = applyWritingPreferenceStructure(baseline, detected);
    expect(applied.text.trimStart().startsWith("結論：")).toBe(true);
    expect(applied.text).toContain("- ");
    expect(applied.appliedKeys).toEqual(
      expect.arrayContaining([
        "length:short",
        "structure:bullets",
        "conclusion:first",
      ]),
    );

    const overlay = buildContentOverlay({ values: rows, injectionText: "inj" });
    const text = applyContentOverlayToText(baseline, overlay);
    expect(text).toContain("【適用する好み】");
    expect(text.trimStart().includes("結論：") || text.includes("結論：")).toBe(
      true,
    );
  });

  it("Scenario1: save preference then apply on a different assignment without restating", async () => {
    const saved = await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "writing_preference",
      title: "文章の好み",
      summary: "今後、文章は短め・箇条書き中心・結論を最初にしてください",
      value: buildExplicitWritingPreferenceValue(
        "今後、文章は短め・箇条書き中心・結論を最初にしてください",
      ),
      source: "explicit",
      status: "active",
      confidence: 0.95,
    });

    const job2 = "別jobの進捗メモを作成してください";
    expect(job2.includes("短め")).toBe(false);

    const resolved = await resolveForContext({
      userId: USER,
      notes: job2,
      artifactTypes: ["docx"],
    });
    expect(resolved.ledger.memoryIdsUsed).toContain(saved.id);

    const artifact = await applyMemoryForDeliverable({
      userId: USER,
      content:
        "導入が長い文章です。背景を詳しく述べます。結論は来週確定です。補足もあります。",
      format: "docx",
      assignment: job2,
    });
    expect(artifact.memoryRetrieved).toBe(true);
    expect(artifact.memoryApplied).toBe(true);
    expect(artifact.appliedPreferenceKeys).toEqual(
      expect.arrayContaining([
        "length:short",
        "structure:bullets",
        "conclusion:first",
      ]),
    );
    expect(artifact.content).toContain("結論：");
    expect(artifact.content).toMatch(/^- /m);

    const auto = await applyMemoryForAutomation({
      automation: sampleAutomation(USER),
    });
    expect(auto.diagnostics.applied).toBe(true);
    expect(auto.ledger.memoryIdsUsed).toContain(saved.id);
    expect(auto.contentOverlay.preferenceKeys).toContain("length:short");

    await deletePersonalMemory(USER, saved.id);
    const afterDelete = await applyMemoryForDeliverable({
      userId: USER,
      content: "結論は削除後です。長い導入。",
      format: "docx",
      assignment: "削除後",
    });
    expect(afterDelete.memoryIdsUsed).not.toContain(saved.id);
  });

  it("N-01/N-02 regression: media overclaim and 60s SLA stay absent", () => {
    const premium = getPlanDefinition("premium");
    expect(premium.limits.imageGeneration).toBe(false);
    expect(premium.limits.videoGeneration).toBe(false);
    const labels = QUICK_REQUEST_PRESETS.map((p) => p.label);
    expect(labels).not.toContain("画像生成");
    expect(labels).not.toContain("動画生成");
    for (const pattern of FORBIDDEN_MEDIA_GENERATION_CLAIM_PATTERNS) {
      if (pattern === "画像生成" || pattern === "動画生成") {
        expect(MINERVOT_DEFAULT_DESCRIPTION).not.toContain(pattern);
      }
    }
    expect(findUnprovenSpeedClaims(MINERVOT_DEFAULT_DESCRIPTION)).toHaveLength(
      0,
    );
    expect(findUnprovenSpeedClaims("登録後60秒以内に1件完成を目指せます").length).toBeGreaterThan(
      0,
    );
  });
});
