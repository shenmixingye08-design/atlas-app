/**
 * MINERVOT VALUE MOAT — TEST 1–11.
 * Deterministic contracts. No LLM judge. No fake success.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));
vi.mock("@/lib/personal-memory/durable", () => ({
  ensurePersonalMemoryHydrated: vi.fn(async () => undefined),
  schedulePersistPersonalMemory: vi.fn(),
  persistPersonalMemoryNow: vi.fn(async () => "skipped"),
  wipePersonalMemoryDurable: vi.fn(),
}));

import { applyMemoryForDeliverable } from "@/lib/memory-apply/deliverables";
import { applyMemoryForAutomation } from "@/lib/memory-apply/automation";
import { applyMemoryToStepBody } from "@/lib/memory-apply/step-body";
import {
  detectInstructionPreferenceItems,
  preferenceApplicationRate,
} from "@/lib/memory-apply/instruction-reduction";
import { ingestCorrectionSignal } from "@/lib/personal-memory/service";
import {
  clearAllPersonalMemoryData,
  listStoredPersonalMemories,
  writePersonalMemorySettings,
} from "@/lib/personal-memory/store";
import { DEFAULT_PERSONAL_MEMORY_SETTINGS } from "@/lib/personal-memory/types";
import { getPlanDefinition, listPlanDefinitions } from "@/lib/billing/plans";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";

import {
  FIRST_RUN_SPEC_KEYS,
  detectRespecification,
  isScopeAllowedForGenre,
  resolveMemoryLayer,
  shouldShowPreferenceAppliedNotice,
} from "@/lib/value-moat/memory-priority";
import {
  applyExcelWorkShape,
  applyWordWorkShape,
  containsForbiddenDeliverableResidue,
  extractExcelColumnsFromInstruction,
  extractExcelWorkShape,
  extractPptxWorkShape,
  extractWordWorkShape,
  isSamePeriodReuseCue,
} from "@/lib/value-moat/structure-reuse";
import {
  mintRerunJobId,
  planHistoryRerun,
  refreshPeriodInAssignment,
} from "@/lib/value-moat/rerun";
import {
  evaluateTerminalSuccess,
  isGenerationOnlySuccess,
  shouldEmitSuccessNotification,
} from "@/lib/value-moat/terminal-success";
import { listLiveAutomations } from "@/lib/value-moat/automation-honesty";
import { buildEntrustedWorkCards } from "@/lib/value-moat/home-entrusted";
import { buildValueMetrics } from "@/lib/value-moat/value-metrics";
import { VALUE_MOAT_FEATURE_AUDIT } from "@/lib/value-moat/feature-audit";
import {
  FORBIDDEN_VALUE_CLAIMS,
  VALUE_MOAT_HEADLINE,
} from "@/lib/value-moat/messaging";
import { hasTouchTargetClass } from "@/lib/value-moat/mobile";

const USER_A = "user_value_moat_a";
const USER_B = "user_value_moat_b";

const FIRST_WORD =
  "営業報告書をWordで。簡潔に。丁寧に。見出し3つ。";

function stubXAutomation(userId: string): AutomationV2 {
  const now = new Date().toISOString();
  return {
    id: "auto_value_moat_x",
    userId,
    name: "毎朝のX投稿",
    description: "MINERVOTのX投稿",
    status: "active",
    trigger: {
      type: "schedule",
      timezone: "Asia/Tokyo",
      schedule: {
        frequency: "daily",
        hour: 10,
        minute: 0,
        daysOfWeek: [1, 2, 3, 4, 5],
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
          id: "s_x",
          type: "x_post",
          name: "X投稿",
          order: 0,
          enabled: true,
          inputBindings: {},
          configuration: { text: "今日の進捗です。詳細を長く書きます。" },
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
      notifyOn: { success: true, failure: true },
      retry: { maxAttempts: 1, backoffMs: [0] },
    },
    memoryPolicy: {
      allowedScopes: ["writing_style", "recurring_work_preferences"],
      deniedScopes: [],
      lockedOverrides: {},
    },
    instruction: {
      freeformNotes: "今日の進捗を投稿して",
      structuredOptions: {},
    },
    createdAt: now,
    updatedAt: now,
  } as unknown as AutomationV2;
}

describe("VALUE MOAT TEST 1 Memory re-spec reduction", () => {
  beforeEach(() => {
    clearAllPersonalMemoryData(USER_A);
    writePersonalMemorySettings(USER_A, {
      ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
      enabled: true,
      proposeFromCorrections: true,
    });
  });

  it("reuses Word / short / polite / 3 headings without restating them", async () => {
    const firstKeys = detectInstructionPreferenceItems(FIRST_WORD);
    expect(firstKeys).toEqual(expect.arrayContaining([...FIRST_RUN_SPEC_KEYS]));
    expect(firstKeys.length).toBeGreaterThanOrEqual(4);

    const saved = await ingestCorrectionSignal({
      userId: USER_A,
      text: FIRST_WORD,
      artifactType: "docx",
      source: "user_correction",
    });
    expect(saved?.status).toBe("active");

    const second = "今週分も";
    expect(detectInstructionPreferenceItems(second)).toHaveLength(0);

    const applied = await applyMemoryForDeliverable({
      userId: USER_A,
      content:
        "導入が長い文章です。背景を詳しく述べます。結論は来週確定です。補足もあります。来月の予定も書きます。",
      format: "docx",
      assignment: second,
    });

    const respec = detectRespecification({
      firstInstruction: FIRST_WORD,
      secondInstruction: second,
      savedKeys: applied.appliedPreferenceKeys,
    });
    expect(respec.secondSpecCount).toBe(0);
    expect(respec.reusedCount).toBe(4);
    expect(respec.allFirstKeysReused).toBe(true);
    expect(
      preferenceApplicationRate({
        expectedKeys: [...FIRST_RUN_SPEC_KEYS],
        appliedKeys: applied.appliedPreferenceKeys,
      }),
    ).toBe(1);
    expect((applied.content.match(/^## /gm) ?? []).length).toBe(3);
    expect(applied.preferenceNotice).toMatch(/前回の好みを反映しました/);
  });
});

describe("VALUE MOAT TEST 2 Override", () => {
  beforeEach(() => {
    clearAllPersonalMemoryData(USER_A);
    writePersonalMemorySettings(USER_A, {
      ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
      enabled: true,
      proposeFromCorrections: true,
    });
  });

  it("今回は詳しく beats Memory 短く", async () => {
    await ingestCorrectionSignal({
      userId: USER_A,
      text: "今後は短めにして",
      source: "user_explicit",
    });
    const length = resolveMemoryLayer({
      explicitValue: "long",
      memoryValue: "short",
      defaultValue: "neutral",
    });
    expect(length.layer).toBe("explicit");
    expect(length.value).toBe("long");

    const longBase =
      "導入として背景を丁寧に説明します。市場の状況も述べます。結論は継続です。補足として来月の予定と採用計画、顧客フォローの三点を残します。さらにリスクも共有します。";
    const applied = await applyMemoryForDeliverable({
      userId: USER_A,
      content: longBase,
      format: "docx",
      assignment: "今回は詳しく今週分も作って",
    });
    expect(applied.appliedPreferenceKeys).not.toContain("length:short");
    expect(applied.content.length).toBeGreaterThan(longBase.length * 0.8);
  });
});

describe("VALUE MOAT TEST 3 Excel structure reuse", () => {
  it("reuses columns only and never copies previous numbers", () => {
    const instruction =
      "レシートから家計簿Excelを作って。日付 / 店名 / 分類 / 金額 / 備考にして";
    const columns = extractExcelColumnsFromInstruction(instruction);
    expect(columns).toEqual(["日付", "店名", "分類", "金額", "備考"]);

    const previous = extractExcelWorkShape({
      headers: columns,
      rows: [["2026-07-01", "A店", "食費", 1280, "個人名"]],
      formulas: ["=SUM(D2:D10)"],
      freezePane: "A2",
      filterEnabled: true,
    });
    expect(previous.columns).toEqual(columns);
    expect(JSON.stringify(previous)).not.toMatch(/1280|個人名|2026-07-01|A店/);

    const applied = applyExcelWorkShape({
      shape: previous,
      newRows: [["2026-08-03", "B店", "交通", 540, ""]],
    });
    expect(applied.headers).toEqual(columns);
    expect(applied.copiedPreviousValues).toBe(false);
    expect(applied.rows.flat().join(",")).not.toContain("1280");
    expect(applied.rows.flat().join(",")).not.toContain("個人名");
    expect(isSamePeriodReuseCue("今月分も")).toBe(true);
  });
});

describe("VALUE MOAT TEST 4 Word structure reuse", () => {
  it("keeps structure and forbids copying last week's body", () => {
    const first = extractWordWorkShape({
      content: "## 背景\n\n先月の売上は秘密です。\n\n## 課題\n\n人員不足。\n\n## 実施方法\n\n来月対応。",
      tone: "polite",
      length: "short",
    });
    expect(first.headingCount).toBe(3);
    const nextContent =
      "## 背景\n\n今週の進捗です。\n\n## 課題\n\n納期が近いです。\n\n## 実施方法\n\n優先順位を付けます。";
    const applied = applyWordWorkShape({
      shape: first,
      newContent: nextContent,
    });
    expect(applied.reusedPreviousBody).toBe(false);
    expect(applied.content).not.toContain("先月の売上は秘密です");
    expect(applied.content).toContain("今週の進捗です");
    expect(containsForbiddenDeliverableResidue(applied.content)).toBe(false);
    expect(isSamePeriodReuseCue("先週と同じ形式で今週分")).toBe(true);
  });
});

describe("VALUE MOAT TEST 5 History rerun", () => {
  it("mints a new job id and refreshes the period", () => {
    const plan = planHistoryRerun(
      {
        previousJobId: "job_july_report",
        workRequest: "7月営業報告書をWordで作って",
        format: "docx",
        status: "completed",
      },
      new Date("2026-08-22T00:00:00+09:00"),
    );
    expect(plan.allowed).toBe(true);
    expect(plan.newJobId).not.toBe("job_july_report");
    expect(plan.newJobId).not.toBe(plan.previousJobId);
    expect(plan.copyArtifact).toBe(false);
    expect(plan.reuseWorkShape).toBe(true);
    expect(plan.assignment).toContain("8月");
    expect(plan.assignment).not.toMatch(/^7月/);
    expect(mintRerunJobId(1)).not.toBe(mintRerunJobId(2));
    expect(refreshPeriodInAssignment("2026-07営業報告", new Date("2026-08-01"))).toContain(
      "2026-08",
    );
  });
});

describe("VALUE MOAT TEST 6 X set-once", () => {
  beforeEach(() => {
    clearAllPersonalMemoryData(USER_A);
    writePersonalMemorySettings(USER_A, {
      ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
      enabled: true,
      proposeFromCorrections: true,
    });
  });

  it("does not require re-instruction after the first X setup", async () => {
    expect(listLiveAutomations().some((item) => item.id === "x_daily_post")).toBe(
      true,
    );
    await ingestCorrectionSignal({
      userId: USER_A,
      text: "今後Xは短め、丁寧、ハッシュタグは2個にして",
      source: "user_explicit",
    });
    const auto = await applyMemoryForAutomation({
      automation: stubXAutomation(USER_A),
    });
    expect(auto.diagnostics.applied).toBe(true);
    const body = await applyMemoryToStepBody({
      userId: USER_A,
      channel: "x_post",
      baseline: "今日の進捗です。詳細を長く書きます。補足もあります。#a #b #c #d",
    });
    expect(body.applied).toBe(true);
    expect((body.text.match(/#[^\s#]+/g) ?? []).length).toBeLessThanOrEqual(2);
  });
});

describe("VALUE MOAT TEST 7 Terminal success", () => {
  it("does not mark the job complete when the artifact failed", () => {
    const word = evaluateTerminalSuccess({
      kind: "word",
      generationSucceeded: true,
      artifactSaved: false,
      downloadable: false,
    });
    expect(word.complete).toBe(false);
    expect(isGenerationOnlySuccess({
      kind: "word",
      generationSucceeded: true,
      artifactSaved: false,
      downloadable: false,
    })).toBe(true);

    expect(
      evaluateTerminalSuccess({
        kind: "excel",
        artifactSaved: true,
        downloadable: true,
      }).complete,
    ).toBe(true);
    expect(
      evaluateTerminalSuccess({
        kind: "pdf",
        artifactSaved: true,
        downloadable: true,
        readBackVerified: false,
      }).complete,
    ).toBe(false);
    expect(
      evaluateTerminalSuccess({
        kind: "x_post",
        generationSucceeded: true,
        providerPosted: false,
      }).complete,
    ).toBe(false);
  });
});

describe("VALUE MOAT TEST 8 Success notification", () => {
  it("emits success notification only after terminal success", () => {
    expect(
      shouldEmitSuccessNotification({
        kind: "x_post",
        providerPosted: true,
        tweetId: "123",
      }),
    ).toBe(true);
    expect(
      shouldEmitSuccessNotification({
        kind: "x_post",
        generationSucceeded: true,
        providerPosted: false,
      }),
    ).toBe(false);
    expect(
      shouldEmitSuccessNotification({
        kind: "word",
        generationSucceeded: true,
        artifactSaved: false,
      }),
    ).toBe(false);
  });
});

describe("VALUE MOAT TEST 9 User isolation", () => {
  beforeEach(() => {
    clearAllPersonalMemoryData(USER_A);
    clearAllPersonalMemoryData(USER_B);
    writePersonalMemorySettings(USER_A, {
      ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
      enabled: true,
      proposeFromCorrections: true,
    });
    writePersonalMemorySettings(USER_B, {
      ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
      enabled: true,
    });
  });

  it("never leaks user A memory or history into user B", async () => {
    await ingestCorrectionSignal({
      userId: USER_A,
      text: FIRST_WORD,
      artifactType: "docx",
      source: "user_correction",
    });
    expect(listStoredPersonalMemories(USER_A).length).toBeGreaterThan(0);
    expect(listStoredPersonalMemories(USER_B)).toEqual([]);

    const appliedB = await applyMemoryForDeliverable({
      userId: USER_B,
      content: "導入です。本文です。結論です。",
      format: "docx",
      assignment: "今週分も",
    });
    expect(appliedB.memoryRetrieved).toBe(false);
    expect(appliedB.preferenceNotice).toBeNull();
    expect(
      shouldShowPreferenceAppliedNotice({
        applied: appliedB.memoryApplied,
        appliedPreferenceKeys: appliedB.appliedPreferenceKeys,
        preferenceNotice: appliedB.preferenceNotice,
      }),
    ).toBe(false);
    expect(isScopeAllowedForGenre("x_post", "excel_template")).toBe(false);
  });
});

describe("VALUE MOAT TEST 10 Entitlements", () => {
  it("keeps Free 0 / Light 980 / Standard 2980 / Premium 9800", () => {
    expect(getPlanDefinition("free").monthlyPriceJpy).toBe(0);
    expect(getPlanDefinition("light").monthlyPriceJpy).toBe(980);
    expect(getPlanDefinition("standard").monthlyPriceJpy).toBe(2980);
    expect(getPlanDefinition("premium").monthlyPriceJpy).toBe(9800);
    expect(listPlanDefinitions().map((plan) => plan.planId)).toEqual([
      "free",
      "light",
      "standard",
      "premium",
    ]);
  });
});

describe("VALUE MOAT TEST 11 Mobile", () => {
  it("keeps Home / history / rerun / Memory / deliverable operable on phones", () => {
    const home = readFileSync(
      join(process.cwd(), "components/automation-first/home-primary-actions.tsx"),
      "utf8",
    );
    const entrusted = readFileSync(
      join(process.cwd(), "components/automation-first/entrusted-work.tsx"),
      "utf8",
    );
    const history = readFileSync(
      join(process.cwd(), "components/activity-history/activity-history-detail.tsx"),
      "utf8",
    );
    const output = readFileSync(
      join(process.cwd(), "components/workspace/final-output.tsx"),
      "utf8",
    );
    expect(hasTouchTargetClass(home)).toBe(true);
    expect(hasTouchTargetClass(entrusted)).toBe(true);
    expect(hasTouchTargetClass(history)).toBe(true);
    expect(history).toContain("history-rerun");
    expect(history).toContain("safe-area-inset");
    expect(output).toContain("preference-applied-notice");
    expect(output).toContain("safe-area-inset");
    expect(output).not.toContain("今週分|同じように");
  });
});

describe("VALUE MOAT honesty", () => {
  it("hides unmeasurable metrics and forbids overclaim copy", () => {
    expect(buildValueMetrics({})).toEqual([]);
    expect(buildValueMetrics({ completedThisMonth: 0, autoRunsThisMonth: 0 })).toEqual(
      [],
    );
    expect(buildValueMetrics({ completedThisMonth: 12, autoRunsThisMonth: 8 })).toEqual([
      {
        id: "completed",
        label: "今月MINERVOTが完了した仕事",
        count: 12,
      },
      { id: "auto_runs", label: "自動実行", count: 8 },
    ]);
    expect(buildEntrustedWorkCards({ automations: [] })).toEqual([]);
    expect(extractPptxWorkShape({ slideTitles: ["現状", "施策", "次"] }).slideCountTendency).toBe(
      3,
    );
    const hero = readFileSync(
      join(process.cwd(), "components/landing/landing-hero-section.tsx"),
      "utf8",
    );
    expect(hero).toContain(VALUE_MOAT_HEADLINE);
    for (const claim of FORBIDDEN_VALUE_CLAIMS) {
      expect(hero).not.toContain(claim);
    }
    expect(VALUE_MOAT_FEATURE_AUDIT).toHaveLength(15);
    expect(VALUE_MOAT_FEATURE_AUDIT.every((row) => ["A", "B", "C"].includes(row.grade))).toBe(
      true,
    );
  });
});
