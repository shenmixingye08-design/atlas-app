import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "clerk"),
  loadDurableDomain: vi.fn(async () => null),
}));
vi.mock("@/lib/personal-memory/durable", () => ({
  ensurePersonalMemoryHydrated: vi.fn(async () => undefined),
  schedulePersistPersonalMemory: vi.fn(),
  wipePersonalMemoryDurable: vi.fn(),
}));

import {
  applyContentOverlayToText,
  buildContentOverlay,
  buildDeliverableOverlay,
} from "@/lib/memory-apply/overlays";
import {
  compareMemoryQuality,
  expectedTokensFromMemoryValues,
} from "@/lib/memory-apply/quality-diff";
import {
  getMemoryApplyMetrics,
  recordMemoryApplyEvent,
  resetMemoryApplyMetricsForTests,
} from "@/lib/memory-apply/metrics";
import { resetMemoryApplyLogForTests } from "@/lib/memory-apply/apply-log";
import { auditMemoryApplyCoverage } from "@/lib/memory-apply/audit";
import { applyOcrCorrections } from "@/lib/memory-apply/ocr";
import {
  correctOcrTextWithMemory,
  saveOcrCorrectionToMemory,
} from "@/lib/memory-apply/ocr";
import { applyMemoryForAutomation } from "@/lib/memory-apply/automation";
import { applyMemoryForRegenerate } from "@/lib/memory-apply/regenerate";
import { applyMemoryForDeliverable } from "@/lib/memory-apply/deliverables";
import { resolveNotificationPreferencesWithMemorySync } from "@/lib/memory-apply/notifications";
import { resolveSchedulerMemoryDefaults } from "@/lib/memory-apply/scheduler";
import { createVisionStyleMemoryCandidates } from "@/lib/memory-apply/vision";
import { readPersonalMemoryFromMetadata } from "@/lib/memory-apply/orchestration-metadata";
import {
  clearAllPersonalMemoryData,
  upsertStoredPersonalMemory,
  writePersonalMemorySettings,
} from "@/lib/personal-memory/store";
import {
  DEFAULT_PERSONAL_MEMORY_SETTINGS,
  type PersonalMemoryRecord,
} from "@/lib/personal-memory/types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/types";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";

const USER = "user_memory_apply_test";

function seedMemory(
  overrides: Partial<PersonalMemoryRecord> &
    Pick<PersonalMemoryRecord, "scope" | "key" | "value" | "title" | "summary">,
): PersonalMemoryRecord {
  const now = new Date().toISOString();
  const row: PersonalMemoryRecord = {
    id: overrides.id ?? `mem_${Math.random().toString(16).slice(2, 10)}`,
    userId: USER,
    kind: overrides.kind ?? "user_preference",
    scope: overrides.scope,
    key: overrides.key,
    value: overrides.value,
    title: overrides.title,
    summary: overrides.summary,
    source: overrides.source ?? "explicit",
    confidence: overrides.confidence ?? 0.9,
    status: overrides.status ?? "active",
    sensitivity: overrides.sensitivity ?? "normal",
    appliesTo: overrides.appliesTo ?? {
      global: true,
      automationIds: [],
      artifactTypes: [],
      capabilities: [],
    },
    evidence: overrides.evidence ?? [
      { kind: "manual", summary: "test", occurredAt: now },
    ],
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    expiresAt: null,
    rejectedReason: null,
    deletedAt: null,
  };
  upsertStoredPersonalMemory(row);
  return row;
}

function sampleAutomation(memoryEnabled: boolean): AutomationV2 {
  const now = new Date().toISOString();
  return {
    id: "auto_mem_1",
    userId: USER,
    name: "週次レポート",
    description: "週次レポート作成",
    status: "active",
    trigger: {
      type: "schedule",
      timezone: "Asia/Tokyo",
      schedule: {
        frequency: "weekly",
        hour: 9,
        minute: 0,
        daysOfWeek: [1],
        cronDerived: null,
        startAt: null,
        endAt: null,
      },
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
          configuration: { title: "週次レポート" },
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
      freeformNotes: "週次レポートを作成してください",
    },
    memoryPolicy: {
      enabled: memoryEnabled,
      allowedScopes: [
        "writing_style",
        "preferred_templates",
        "notification_preferences",
        "timezone",
      ],
      deniedScopes: [],
      lockedOverrides: {},
    },
    legacyAutomationId: null,
    schemaVersion: 2,
    lastRunAt: null,
    nextRunAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

beforeEach(() => {
  clearAllPersonalMemoryData(USER);
  writePersonalMemorySettings(USER, {
    ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
    enabled: true,
  });
  resetMemoryApplyMetricsForTests();
});

describe("Memory Apply — quality diff ON vs OFF", () => {
  it("1. Memory OFF baseline has zero improvement hits", () => {
    const diff = compareMemoryQuality({
      before: "報告書です",
      after: "報告書です",
      memoryMode: "off",
      expectedMemoryTokens: ["株式会社ミネルバ", "丁寧語"],
    });
    expect(diff.memoryHitCount).toBe(0);
    expect(diff.memoryMode).toBe("off");
  });

  it("2. Memory ON includes company / style tokens → higher improvement", () => {
    const before = "報告書です";
    const after =
      "【文体】丁寧語\n【連絡先】株式会社ミネルバ\n\n報告書です\n\n敬具 山田";
    const off = compareMemoryQuality({
      before,
      after: before,
      memoryMode: "off",
      expectedMemoryTokens: ["株式会社ミネルバ", "丁寧語", "敬具"],
    });
    const on = compareMemoryQuality({
      before,
      after,
      memoryMode: "on",
      expectedMemoryTokens: ["株式会社ミネルバ", "丁寧語", "敬具"],
    });
    expect(on.memoryHitCount).toBeGreaterThan(off.memoryHitCount);
    expect(on.improvementRate).toBeGreaterThan(off.improvementRate);
  });

  it("3. charDelta and overlap are numeric", () => {
    const diff = compareMemoryQuality({
      before: "abc",
      after: "abc def",
      memoryMode: "on",
    });
    expect(diff.charDelta).toBe(4);
    expect(typeof diff.overlapRatio).toBe("number");
    expect(typeof diff.qualityScore).toBe("number");
  });
});

describe("Memory Apply — content / deliverable overlays", () => {
  it("4. content overlay injects writing style and signature", () => {
    const overlay = buildContentOverlay({
      values: [
        {
          memoryId: "1",
          scope: "writing_style",
          key: "tone",
          value: { text: "丁寧語", tone: "丁寧" },
          title: "文体",
          summary: "丁寧語",
          source: "explicit",
          layer: "global_memory",
          sensitivity: "normal",
        },
      ],
      injectionText: "署名を付けてください",
    });
    const text = applyContentOverlayToText("本文", {
      ...overlay,
      signature: "株式会社ミネルバ",
    });
    expect(text).toContain("丁寧語");
    expect(text).toContain("株式会社ミネルバ");
    expect(text).toContain("本文");
  });

  it("5. Word overlay maps company brand fields", () => {
    const overlay = buildDeliverableOverlay({
      userId: USER,
      values: [
        {
          memoryId: "c1",
          scope: "contact_info",
          key: "company",
          value: {
            companyName: "株式会社ミネルバ",
            brandColorHex: "1A2B3C",
            footerText: "機密",
          },
          title: "会社",
          summary: "株式会社ミネルバ",
          source: "explicit",
          layer: "global_memory",
          sensitivity: "sensitive",
        },
      ],
    });
    expect(overlay.companyName).toBe("株式会社ミネルバ");
    expect(overlay.brandColorHex).toBe("1A2B3C");
    expect(overlay.footerNote).toBe("機密");
    expect(overlay.brand?.companyName).toBe("株式会社ミネルバ");
  });

  it("6. Excel overlay exposes column/currency/date", () => {
    const overlay = buildDeliverableOverlay({
      userId: USER,
      values: [
        {
          memoryId: "e1",
          scope: "excel_template",
          key: "excel",
          value: {
            currency: "JPY",
            date_format: "YYYY/MM/DD",
            columnOrder: ["日付", "金額", "摘要"],
            decimalPlaces: 0,
          },
          title: "Excel",
          summary: "JPY",
          source: "explicit",
          layer: "global_memory",
          sensitivity: "normal",
        },
      ],
    });
    expect(overlay.excel.currency).toBe("JPY");
    expect(overlay.excel.dateFormat).toBe("YYYY/MM/DD");
    expect(overlay.excel.columnOrder).toEqual(["日付", "金額", "摘要"]);
    expect(overlay.excel.decimalPlaces).toBe(0);
  });

  it("7. PowerPoint overlay exposes brand color/font", () => {
    const overlay = buildDeliverableOverlay({
      userId: USER,
      values: [
        {
          memoryId: "p1",
          scope: "powerpoint_theme",
          key: "theme",
          value: { brandColorHex: "AABBCC", defaultFont: "Yu Gothic" },
          title: "PPT",
          summary: "brand",
          source: "explicit",
          layer: "global_memory",
          sensitivity: "normal",
        },
      ],
    });
    expect(overlay.powerpoint.brandColorHex).toBe("AABBCC");
    expect(overlay.powerpoint.fontFace).toBe("Yu Gothic");
  });

  it("8. PDF overlay exposes footer", () => {
    const overlay = buildDeliverableOverlay({
      userId: USER,
      values: [
        {
          memoryId: "pdf1",
          scope: "pdf_layout",
          key: "footer",
          value: { footerText: "社外秘", brandColorHex: "112233" },
          title: "PDF",
          summary: "footer",
          source: "explicit",
          layer: "global_memory",
          sensitivity: "normal",
        },
      ],
    });
    expect(overlay.pdf.footerNote).toBe("社外秘");
    expect(overlay.pdf.brandColorHex).toBe("112233");
  });

  it("9. forbidden expressions are stripped from body when applying overlay", () => {
    const text = applyContentOverlayToText("これはNGワードです", {
      injectionText: "",
      writingStyle: null,
      tone: null,
      forbiddenExpressions: ["NGワード"],
      signature: null,
      contactLines: [],
      workStyleNotes: [],
      ocrDictionary: {},
      visionHints: [],
      preferenceKeys: [],
      preferShort: false,
      preferBullets: false,
      preferConclusionFirst: false,
    });
    // Body is cleaned; header may list the ban for generators/planner.
    expect(text).toContain("【禁止表現】");
    expect(text.split("\n\n").pop()).not.toContain("NGワード");
  });
});

describe("Memory Apply — OCR", () => {
  it("10. OCR corrections replace dictionary terms", () => {
    const corrected = applyOcrCorrections("ミネルハ株式会社 03-0000", {
      ミネルハ: "ミネルバ",
      "03-0000": "03-1234-5678",
    });
    expect(corrected).toContain("ミネルバ");
    expect(corrected).toContain("03-1234-5678");
  });

  it("11. OCR ON vs OFF quality differs when dictionary present", async () => {
    seedMemory({
      kind: "work_preference",
      scope: "work_content_style",
      key: "ocr_dictionary",
      title: "OCR",
      summary: "補正",
      value: { dictionary: { ミネルハ: "ミネルバ" }, from: "ミネルハ", to: "ミネルバ" },
      source: "explicit",
      status: "active",
    });
    const offText = "ミネルハ株式会社";
    const on = await correctOcrTextWithMemory({ userId: USER, text: offText });
    expect(on.corrected).toContain("ミネルバ");
    expect(on.quality.memoryMode).toBe("on");
    expect(on.quality.improvementRate).toBeGreaterThan(0);
  });

  it("12. OCR correction save creates candidate", async () => {
    const id = await saveOcrCorrectionToMemory({
      userId: USER,
      from: "誤認",
      to: "正解",
    });
    expect(id).toBeTruthy();
  });

  it("13. first OCR has empty dict; second can use saved active memory", async () => {
    const first = await correctOcrTextWithMemory({
      userId: USER,
      text: "誤認商品",
    });
    expect(Object.keys(first.dictionary).length).toBe(0);
    seedMemory({
      kind: "work_preference",
      scope: "work_content_style",
      key: "ocr_dictionary",
      title: "dict",
      summary: "誤認→正解",
      value: { dictionary: { 誤認: "正解" } },
      source: "explicit",
      status: "active",
    });
    const second = await correctOcrTextWithMemory({
      userId: USER,
      text: "誤認商品",
    });
    expect(second.corrected).toBe("正解商品");
  });
});

describe("Memory Apply — Automation", () => {
  it("14. Memory OFF automation → resolvedInstruction null / not applied", async () => {
    const result = await applyMemoryForAutomation({
      automation: sampleAutomation(false),
    });
    expect(result.resolvedInstruction).toBeNull();
    expect(result.diagnostics.applied).toBe(false);
    expect(result.diagnostics.memoryEnabled).toBe(false);
  });

  it("15. Memory ON automation with memories → resolvedInstruction set", async () => {
    seedMemory({
      scope: "writing_style",
      key: "tone",
      title: "文体",
      summary: "丁寧語",
      value: { text: "丁寧語", tone: "丁寧" },
      source: "explicit",
      status: "active",
    });
    const result = await applyMemoryForAutomation({
      automation: sampleAutomation(true),
    });
    expect(result.resolvedInstruction).not.toBeNull();
    expect(result.diagnostics.memoryEnabled).toBe(true);
    expect(result.injectionText.length).toBeGreaterThan(0);
    expect(result.memoryUsage.memoryIdsUsed?.length ?? 0).toBeGreaterThan(0);
  });

  it("16. Automation ON vs OFF quality improvement differs", async () => {
    seedMemory({
      scope: "writing_style",
      key: "tone",
      title: "文体",
      summary: "丁寧語で敬具",
      value: { text: "丁寧語で敬具" },
      source: "explicit",
      status: "active",
    });
    const off = await applyMemoryForAutomation({
      automation: sampleAutomation(false),
    });
    const on = await applyMemoryForAutomation({
      automation: sampleAutomation(true),
    });
    expect(on.diagnostics.quality!.improvementRate).toBeGreaterThanOrEqual(
      off.diagnostics.quality!.improvementRate,
    );
    expect(on.diagnostics.applied).toBe(true);
    expect(off.diagnostics.applied).toBe(false);
  });

  it("17. Retry reuses memory resolve (2nd call still applies)", async () => {
    seedMemory({
      scope: "writing_style",
      key: "tone",
      title: "文体",
      summary: "ビジネス丁寧",
      value: { text: "ビジネス丁寧" },
      source: "explicit",
      status: "active",
    });
    const first = await applyMemoryForAutomation({
      automation: sampleAutomation(true),
    });
    const second = await applyMemoryForAutomation({
      automation: sampleAutomation(true),
    });
    expect(first.ledger.memoryIdsUsed).toEqual(second.ledger.memoryIdsUsed);
    expect(second.resolvedInstruction).not.toBeNull();
  });
});

describe("Memory Apply — Vision / Notification / Scheduler / Regenerate", () => {
  it("18. Vision profile_save creates candidates", async () => {
    const created = await createVisionStyleMemoryCandidates({
      userId: USER,
      signals: {
        tone: "丁寧",
        politeness: "ですます",
        sentenceLength: "短め",
        headingStyle: "番号付き",
        frequentPhrases: ["恐れ入りますが"],
        ctaStyle: "控えめ",
        structure: "結論先出し",
        designTendency: "余白多め",
        forbiddenCandidates: ["煽り"],
      },
      sourceAttachmentIds: ["att_1"],
    });
    expect(created.candidateIds.length).toBeGreaterThan(0);
  });

  it("19. Notification prefs overlay from Memory", () => {
    seedMemory({
      kind: "automation_preference",
      scope: "notification_preferences",
      key: "prefs",
      title: "通知",
      summary: "完了通知OFF",
      value: { completedEnabled: false, allEnabled: true },
      source: "explicit",
      status: "active",
    });
    const resolved = resolveNotificationPreferencesWithMemorySync({
      userId: USER,
      base: DEFAULT_NOTIFICATION_PREFERENCES,
    });
    expect(resolved.applied).toBe(true);
    expect(resolved.preferences.completedEnabled).toBe(false);
  });

  it("20. Scheduler timezone from Memory when explicit absent", async () => {
    seedMemory({
      kind: "locale",
      scope: "timezone",
      key: "tz",
      title: "TZ",
      summary: "Asia/Tokyo",
      value: { timezone: "Asia/Tokyo" },
      source: "explicit",
      status: "active",
    });
    const resolved = await resolveSchedulerMemoryDefaults({
      userId: USER,
      explicitTimezone: null,
    });
    expect(resolved.timezone).toBe("Asia/Tokyo");
    expect(resolved.applied).toBe(true);
  });

  it("21. Regenerate forbids empty previous content", async () => {
    await expect(
      applyMemoryForRegenerate({
        userId: USER,
        previousContent: "   ",
      }),
    ).rejects.toThrow(/REGENERATE_REQUIRES_PREVIOUS_CONTENT/);
  });

  it("22. Regenerate keeps previous body and applies delta", async () => {
    seedMemory({
      scope: "writing_style",
      key: "tone",
      title: "文体",
      summary: "丁寧語維持",
      value: { text: "丁寧語維持" },
      source: "explicit",
      status: "active",
    });
    const previous = "前回の成果物本文です。レイアウト保持。";
    const regen = await applyMemoryForRegenerate({
      userId: USER,
      previousContent: previous,
      improvementNotes: "結論を先頭に",
    });
    expect(regen.content).toContain("前回の成果物本文");
    expect(regen.content).toContain("結論を先頭に");
    expect(regen.preservedLayoutHints.length).toBeGreaterThan(0);
    expect(regen.quality.beforeCharCount).toBe(previous.length);
  });

  it("23. orchestration metadata reader", () => {
    expect(
      readPersonalMemoryFromMetadata({ personalMemory: " 記憶テキスト " }),
    ).toBe("記憶テキスト");
    expect(readPersonalMemoryFromMetadata({})).toBeNull();
  });
});

describe("Memory Apply — Deliverables Word/Excel/PDF/PPT", () => {
  it("24. Word deliverable apply ON includes company", async () => {
    seedMemory({
      kind: "sensitive",
      scope: "contact_info",
      key: "company",
      title: "会社",
      summary: "株式会社ミネルバ",
      value: { companyName: "株式会社ミネルバ", signature: "敬具" },
      source: "explicit",
      status: "active",
    });
    const applied = await applyMemoryForDeliverable({
      userId: USER,
      content: "提案書本文",
      format: "docx",
    });
    expect(applied.applied).toBe(true);
    expect(applied.channel).toBe("word");
    expect(applied.content).toContain("株式会社ミネルバ");
  });

  it("25. Excel deliverable channel", async () => {
    seedMemory({
      scope: "excel_template",
      key: "excel",
      title: "Excel",
      summary: "JPY",
      value: { currency: "JPY" },
      source: "explicit",
      status: "active",
    });
    const applied = await applyMemoryForDeliverable({
      userId: USER,
      content: "| A | B |\n| 1 | 2 |",
      format: "xlsx",
    });
    expect(applied.channel).toBe("excel");
    expect(applied.overlay.excel.currency).toBe("JPY");
  });

  it("26. PDF deliverable channel", async () => {
    seedMemory({
      scope: "pdf_layout",
      key: "pdf",
      title: "PDF",
      summary: "footer",
      value: { footerText: "社外秘" },
      source: "explicit",
      status: "active",
    });
    const applied = await applyMemoryForDeliverable({
      userId: USER,
      content: "PDF本文",
      format: "pdf",
    });
    expect(applied.channel).toBe("pdf");
    expect(applied.overlay.pdf.footerNote).toBe("社外秘");
  });

  it("27. PowerPoint deliverable channel", async () => {
    seedMemory({
      scope: "powerpoint_theme",
      key: "ppt",
      title: "PPT",
      summary: "color",
      value: { brandColorHex: "ABCDEF" },
      source: "explicit",
      status: "active",
    });
    const applied = await applyMemoryForDeliverable({
      userId: USER,
      content: "# 提案\n要点",
      format: "pptx",
    });
    expect(applied.channel).toBe("powerpoint");
    expect(applied.overlay.powerpoint.brandColorHex).toBe("ABCDEF");
  });

  it("28. 10th apply still improves vs empty Memory OFF", async () => {
    seedMemory({
      scope: "writing_style",
      key: "tone",
      title: "文体",
      summary: "ですます調",
      value: { text: "ですます調" },
      source: "explicit",
      status: "active",
    });
    let lastImprovement = 0;
    for (let i = 0; i < 10; i += 1) {
      const applied = await applyMemoryForDeliverable({
        userId: USER,
        content: `レポート第${i + 1}版`,
        format: "docx",
      });
      lastImprovement = applied.quality.improvementRate;
      expect(applied.applied).toBe(true);
    }
    expect(lastImprovement).toBeGreaterThan(0);
  });
});

describe("Memory Apply — metrics / audit / dashboard", () => {
  it("29. metrics accumulate use/update/success", () => {
    recordMemoryApplyEvent({
      userId: USER,
      channel: "word",
      memoryMode: "on",
      applied: true,
      improvementRate: 0.8,
      success: true,
    });
    recordMemoryApplyEvent({
      userId: USER,
      channel: "excel",
      memoryMode: "on",
      applied: true,
      improvementRate: 0.6,
      success: true,
    });
    const metrics = getMemoryApplyMetrics(USER);
    expect(metrics.useCount).toBeGreaterThanOrEqual(2);
    expect(metrics.successRate).toBeGreaterThan(0);
    expect(metrics.averageImprovementRate).toBeGreaterThan(0);
  });

  it("30. audit fails until all channels recorded", () => {
    const before = auditMemoryApplyCoverage(USER);
    expect(before.pass).toBe(false);
    expect(before.missing.length).toBeGreaterThan(0);
  });

  it("31. audit passes after all required channels applied", () => {
    const channels = [
      "automation",
      "vision",
      "ocr",
      "word",
      "excel",
      "pdf",
      "powerpoint",
      "notification",
      "dashboard",
      "regenerate",
      "scheduler",
      "orchestration",
      "commander",
      "prediction",
      "workflow",
    ] as const;
    for (const channel of channels) {
      recordMemoryApplyEvent({
        userId: USER,
        channel,
        memoryMode: "on",
        applied: true,
        success: true,
        improvementRate: 0.5,
      });
    }
    const audit = auditMemoryApplyCoverage(USER);
    expect(audit.pass).toBe(true);
    expect(audit.missing).toEqual([]);
  });

  it("32. expectedTokensFromMemoryValues extracts tokens", () => {
    const tokens = expectedTokensFromMemoryValues({
      companyName: "株式会社ミネルバ",
      tone: "丁寧語",
    });
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("33. Memory OFF deliverable does not invent company", async () => {
    const applied = await applyMemoryForDeliverable({
      userId: USER,
      content: "本文のみ",
      format: "docx",
    });
    expect(applied.content).not.toContain("株式会社架空");
    expect(applied.overlay.companyName).toBeNull();
  });

  it("34. localStorage is listed as non-SoT in audit notes", () => {
    const audit = auditMemoryApplyCoverage();
    expect(audit.localStorageAsMemorySot.length).toBeGreaterThan(0);
    expect(audit.notes.join(" ")).toMatch(/localStorage/);
  });
});

describe("Memory Apply — unified secretary API", () => {
  beforeEach(() => {
    clearAllPersonalMemoryData(USER);
    writePersonalMemorySettings(USER, {
      ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
      enabled: true,
    });
    resetMemoryApplyMetricsForTests();
    resetMemoryApplyLogForTests();
    seedMemory({
      scope: "writing_style",
      key: "tone",
      title: "文体",
      summary: "丁寧で簡潔に",
      value: { text: "丁寧で簡潔に書いてください", tone: "丁寧語" },
    });
    seedMemory({
      scope: "contact_info",
      key: "company",
      title: "会社",
      summary: "株式会社ミネルバ",
      value: { companyName: "株式会社ミネルバ", department: "営業部" },
      kind: "work_preference",
    });
  });

  it("35. MemoryProvider resolves shared context", async () => {
    const { MemoryProvider } = await import("@/lib/memory-apply/provider");
    const result = await MemoryProvider({
      userId: USER,
      channel: "commander",
      assignment: "営業資料を作成",
    });
    expect(result.mode).toBe("on");
    expect(result.combinedInjectionText.length).toBeGreaterThan(0);
    expect(result.memoryIdsUsed.length).toBeGreaterThan(0);
    expect(result.scopesUsed).toContain("writing_style");
  });

  it("36. MemoryApply ON vs OFF comparison", async () => {
    const { MemoryApplyComparison } = await import("@/lib/memory-apply/apply");
    const cmp = await MemoryApplyComparison({
      userId: USER,
      channel: "word",
      baseline: "本日の提案資料です。",
      assignment: "提案資料",
    });
    expect(cmp.off.context.mode).toBe("off");
    expect(cmp.on.context.mode).toBe("on");
    expect(cmp.on.prompt.withMemory.length).toBeGreaterThanOrEqual(
      cmp.off.prompt.withMemory.length,
    );
    expect(cmp.on.quality.improvementRate).toBeGreaterThanOrEqual(0);
    expect(cmp.improvementDelta).toBeGreaterThanOrEqual(0);
  });

  it("37. PromptBuilder / ContextBuilder inject Memory", async () => {
    const { MemoryApply } = await import("@/lib/memory-apply/apply");
    const applied = await MemoryApply({
      userId: USER,
      channel: "powerpoint",
      baseline: "会社紹介スライド",
      assignment: "会社紹介",
    });
    expect(applied.prompt.injection.fullText).toMatch(/記憶|Memory|文体|会社/i);
    expect(applied.surface.plannerKnowledge).toBeTruthy();
    expect(applied.context.facts.companyName).toBe("株式会社ミネルバ");
  });

  it("38. apply log records before/after and token delta", async () => {
    const { MemoryApply } = await import("@/lib/memory-apply/apply");
    const { listMemoryApplyLogs } = await import("@/lib/memory-apply/apply-log");
    await MemoryApply({
      userId: USER,
      channel: "excel",
      baseline: "売上表",
      assignment: "売上",
      artifactIds: ["art_1"],
    });
    const logs = listMemoryApplyLogs(USER, { channel: "excel" });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]!.artifactIds).toContain("art_1");
    expect(logs[0]!.memoryIdsUsed.length).toBeGreaterThan(0);
    expect(typeof logs[0]!.tokenDelta).toBe("number");
  });

  it("39. Prediction uses the same Memory", async () => {
    const { applyMemoryForPrediction } = await import(
      "@/lib/memory-apply/prediction"
    );
    const applied = await applyMemoryForPrediction({
      userId: USER,
      draft: "次は週次レポートの準備がよさそうです",
      assignmentHint: "週次レポート",
    });
    expect(applied.context.channel).toBe("prediction");
    expect(applied.context.mode).toBe("on");
    expect(applied.prompt.withMemory).toBeTruthy();
  });

  it("40. Memory OFF provider returns empty injection", async () => {
    const { MemoryProvider } = await import("@/lib/memory-apply/provider");
    const result = await MemoryProvider({
      userId: USER,
      channel: "vision",
      memoryEnabled: false,
    });
    expect(result.mode).toBe("off");
    expect(result.combinedInjectionText).toBe("");
    expect(result.memoryIdsUsed).toEqual([]);
  });
});
