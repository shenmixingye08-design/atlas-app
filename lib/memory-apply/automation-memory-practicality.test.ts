/**
 * 【ATLAS機能評価】
 *
 * 機能名：Automation × Personal Memory 実用性強化
 * ユーザー価値：一度好みを伝えれば、次の自動化は同じ人らしく動く
 * 差別化：新しい Memory / Automation 基盤を増やさず、既存 SoT を接続する
 * 繰り返し作業の削減：はい（短め・絵文字・ハッシュタグ・承認の毎回指定が減る）
 * AI必要度：不要（lookup / merge / overlay は通常プログラム）
 * AIなしで実装可能：はい
 * 運営コスト：追加 LLM 0。Memory lookup は DB、merge はプログラム
 * 外部APIコスト：無
 * コスト削減案：
 *   - エコモード継承
 *   - まとめて生成しない（preference は structured）
 *   - キャッシュ再利用（同一 run の resolve）
 *   - 予約実行は既存 Scheduler
 *   - AI起動条件は変更しない
 *   - 外部API最小化
 *   - 危険操作は承認ゲート維持
 *   - 同じ Memory を再生成しない
 * 優先度：P0
 */

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

import { formatNaturalLanguageAutomationSuccess } from "@/lib/automations/create-from-natural-language";
import { parseNaturalLanguageAutomation } from "@/lib/automations/create-from-natural-language";
import { applyMemoryToAutomationCreate } from "@/lib/memory-apply/automation-create-apply";
import { measureMemoryApplyDelta } from "@/lib/memory-apply/instruction-reduction";
import { applyPublishedBodyOverlay } from "@/lib/memory-apply/published-body";
import {
  MEMORY_APPLY_EXTRA_LLM_CALLS,
  mergeXSocialPreference,
  parseXSocialPreferenceFromText,
} from "@/lib/memory-apply/x-social-preference";
import {
  classifyMemoryWriteIntent,
  evaluateCorrectionForCandidate,
} from "@/lib/personal-memory";
import * as personalMemoryService from "@/lib/personal-memory/service";
import {
  ingestCorrectionSignal,
  listPersonalMemories,
  resolveForContext,
} from "@/lib/personal-memory/service";
import {
  clearAllPersonalMemoryData,
  writePersonalMemorySettings,
} from "@/lib/personal-memory/store";
import { createPersonalMemory } from "@/lib/personal-memory/service";
import { DEFAULT_PERSONAL_MEMORY_SETTINGS } from "@/lib/personal-memory/types";

const USER = "user_automation_memory_p0";

const DETAILED =
  "今後Xは短めで、絵文字少なめ、ハッシュタグ2個まで、強い営業文禁止、確認なしで出して。毎朝8時にX投稿して";
const MINIMAL = "毎朝8時にX投稿して";
const USUAL = "いつもの感じで";

beforeEach(() => {
  clearAllPersonalMemoryData(USER);
  writePersonalMemorySettings(USER, {
    ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
    enabled: true,
  });
});

async function seedXStyleMemory() {
  return ingestCorrectionSignal({
    userId: USER,
    text: "今後Xでは短めで、絵文字少なめ、ハッシュタグ2個までにして。強い営業文禁止。X投稿は毎回確認なしで出して",
    artifactType: "x_post",
    source: "user_explicit",
  });
}

describe("STEP 3–4 Memory candidate / persist intent", () => {
  it("ケース1: 今後Xは短めで → explicit active Memory", async () => {
    expect(classifyMemoryWriteIntent("今後Xは短めで")).toBe("persist_channel");
    const evaluated = evaluateCorrectionForCandidate({
      userId: USER,
      text: "今後Xは短めで",
      source: "user_explicit",
    });
    expect(evaluated.action).toBe("explicit_active");
    expect(evaluated.input?.status).toBe("active");
    expect(evaluated.input?.value.length).toBe("short");
    expect(evaluated.input?.appliesTo?.artifactTypes).toContain("x_post");

    const saved = await ingestCorrectionSignal({
      userId: USER,
      text: "今後Xは短めで",
      source: "user_explicit",
    });
    expect(saved?.status).toBe("active");
    const rows = await listPersonalMemories(USER, { status: "active" });
    expect(rows.some((row) => row.value.length === "short")).toBe(true);
  });

  it("ケース2: 今日だけ短めで → 永続 Memory にしない", async () => {
    expect(classifyMemoryWriteIntent("今日だけ短めで")).toBe("one_shot");
    const evaluated = evaluateCorrectionForCandidate({
      userId: USER,
      text: "今日だけ短めで",
      source: "user_explicit",
    });
    expect(evaluated.action).toBe("none");
    const saved = await ingestCorrectionSignal({
      userId: USER,
      text: "今日だけ短めで",
      source: "user_explicit",
    });
    expect(saved).toBeNull();
    expect(await listPersonalMemories(USER)).toEqual([]);
  });
});

describe("STEP 5 / 9 / 11 Automation create apply", () => {
  it("ケース3: 毎朝8時にX投稿して → 既存X preference を反映", async () => {
    await seedXStyleMemory();
    const parsed = parseNaturalLanguageAutomation(MINIMAL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const applied = await applyMemoryToAutomationCreate({
      userId: USER,
      text: MINIMAL,
      createInput: parsed.createInput,
    });
    expect(applied.extraLlmCalls).toBe(0);
    expect(MEMORY_APPLY_EXTRA_LLM_CALLS).toBe(0);
    expect(applied.snapshot.appliedPreferences.length).toBe("short");
    expect(applied.snapshot.appliedPreferences.emoji).toBe("few");
    expect(applied.snapshot.appliedPreferences.hashtagsMax).toBe(2);
    expect(applied.snapshot.appliedPreferences.promotional).toBe("none");
    expect(applied.labels).toEqual(
      expect.arrayContaining([
        "短めの文章",
        "絵文字少なめ",
        "ハッシュタグ最大2個",
        "強い営業文なし",
        "即実行",
      ]),
    );
    expect(applied.createInput.executionLevel).toBe("full_auto");
    expect(applied.createInput.workflow.metadata?.appliedPreferenceLabels).toEqual(
      applied.labels,
    );
    const message = formatNaturalLanguageAutomationSuccess({
      name: "X投稿",
      scheduleLabel: "毎日 08:00",
      nextRun: "2026-08-15 08:00",
      executionLevel: "full_auto",
      timezone: "Asia/Tokyo",
      appliedPreferenceLabels: applied.labels,
    });
    expect(message).toContain("あなたの好みを反映");
    expect(message).not.toContain("memoryId");
    expect(JSON.stringify(applied.createInput.workflow.metadata)).not.toMatch(
      /Bearer |sk-|api[_-]?key/i,
    );
  });

  it("Xは必ず投稿前に確認したい → approve_then_run", async () => {
    const saved = await ingestCorrectionSignal({
      userId: USER,
      text: "今後Xは必ず投稿前に確認したい",
      source: "user_explicit",
    });
    expect(saved?.value.approval).toBe("approve_then_run");
    const parsed = parseNaturalLanguageAutomation(MINIMAL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = await applyMemoryToAutomationCreate({
      userId: USER,
      text: MINIMAL,
      createInput: parsed.createInput,
    });
    expect(applied.createInput.executionLevel).toBe("approve_then_run");
    expect(applied.labels).toContain("投稿前に確認");
  });

  it("明示の確認指示が Memory の即実行より優先", async () => {
    await seedXStyleMemory();
    const parsed = parseNaturalLanguageAutomation(
      "毎朝8時にX投稿して。投稿前に確認して",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = await applyMemoryToAutomationCreate({
      userId: USER,
      text: "毎朝8時にX投稿して。投稿前に確認して",
      createInput: parsed.createInput,
    });
    expect(applied.createInput.executionLevel).toBe("approve_then_run");
  });
});

describe("STEP 7 / 10 override vs global", () => {
  it("ケース4: この自動化だけ絵文字なし → Automation override。全体 Memory は変えない", async () => {
    const before = await seedXStyleMemory();
    expect(before?.value.emoji).toBe("few");
    const evaluated = evaluateCorrectionForCandidate({
      userId: USER,
      text: "この自動化だけ絵文字なし",
      source: "user_explicit",
    });
    expect(evaluated.action).toBe("none");

    const parsed = parseNaturalLanguageAutomation(
      "毎朝8時にX投稿して。この自動化だけ絵文字なし",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = await applyMemoryToAutomationCreate({
      userId: USER,
      text: "毎朝8時にX投稿して。この自動化だけ絵文字なし",
      createInput: parsed.createInput,
    });
    expect(applied.snapshot.source).toBe("automation_override");
    expect(applied.snapshot.overriddenPreferences.emoji).toBe("none");
    expect(applied.snapshot.appliedPreferences.emoji).toBe("none");
    expect(applied.snapshot.appliedPreferences.length).toBe("short");
    expect(applied.labels).toContain("絵文字なし");

    const rows = await listPersonalMemories(USER, { status: "active" });
    expect(rows.some((row) => row.value.emoji === "few")).toBe(true);
    expect(rows.some((row) => row.value.emoji === "none")).toBe(false);
  });

  it("ケース5: これから全部絵文字なし → Personal Memory 更新", async () => {
    await seedXStyleMemory();
    expect(classifyMemoryWriteIntent("これから全部絵文字なし")).toBe(
      "persist_global",
    );
    const updated = await ingestCorrectionSignal({
      userId: USER,
      text: "これから全部絵文字なし",
      source: "user_explicit",
    });
    expect(updated?.status).toBe("active");
    expect(updated?.value.emoji).toBe("none");
    const active = await listPersonalMemories(USER, { status: "active" });
    const paused = (await listPersonalMemories(USER)).filter(
      (row) => row.status === "paused" && row.rejectedReason === "superseded",
    );
    expect(active.some((row) => row.value.emoji === "none")).toBe(true);
    expect(active.some((row) => row.value.emoji === "few")).toBe(false);
    expect(paused.length).toBeGreaterThan(0);
  });

  it("ケース6: Memory 短文 vs Automation 長文 → Automation 設定優先", () => {
    const merged = mergeXSocialPreference({
      memory: { length: "short", emoji: "few" },
      automationOverride: { length: "long" },
      explicit: { length: "long" },
    });
    expect(merged.length).toBe("long");
    expect(merged.emoji).toBe("few");
  });

  it("ケース6b: 毎週月曜だけ詳しい長文 → create 時も Automation が勝つ", async () => {
    await seedXStyleMemory();
    const text = "毎週月曜日に詳しい長文でX投稿して";
    const parsed = parseNaturalLanguageAutomation(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = await applyMemoryToAutomationCreate({
      userId: USER,
      text,
      createInput: parsed.createInput,
    });
    expect(applied.snapshot.appliedPreferences.length).toBe("long");
    expect(applied.labels).toContain("詳しい長文");
    expect(applied.snapshot.appliedPreferences.emoji).toBe("few");
  });
});

describe("STEP 8 Memory update conflict", () => {
  it("ケース7: 絵文字多め → これから絵文字なし。二重適用しない", async () => {
    await ingestCorrectionSignal({
      userId: USER,
      text: "今後Xは絵文字多めにして",
      source: "user_explicit",
    });
    await ingestCorrectionSignal({
      userId: USER,
      text: "これからXは絵文字なしにして",
      source: "user_explicit",
    });
    const { result } = await resolveForContext({
      userId: USER,
      allowedScopes: ["writing_style"],
      artifactTypes: ["x_post"],
    });
    const emojis = result.used.map((row) => row.value.emoji).filter(Boolean);
    expect(emojis).toEqual(["none"]);
    expect(emojis).not.toContain("many");
    const active = await listPersonalMemories(USER, { status: "active" });
    expect(active.some((row) => row.value.emoji === "many")).toBe(false);
  });
});

describe("STEP 14 scope safety", () => {
  it("Xの好みを Word へ混ぜない / Excel列順をXへ混ぜない / 家計簿を一般Excelへ混ぜない / 会社用をSNSへ混ぜない", async () => {
    await seedXStyleMemory();
    await createPersonalMemory(USER, {
      kind: "template_preference",
      scope: "excel_template",
      key: "excel",
      value: { columnOrder: ["日付", "金額", "摘要"], text: "Excel列順" },
      title: "Excel列順",
      summary: "Excel列順",
      source: "explicit",
      status: "active",
      appliesTo: {
        global: false,
        automationIds: [],
        artifactTypes: ["xlsx"],
        capabilities: [],
      },
    });
    await createPersonalMemory(USER, {
      kind: "template_preference",
      scope: "word_template",
      key: "word",
      value: { templateId: "report", text: "Wordテンプレート" },
      title: "Word",
      summary: "Wordテンプレート",
      source: "explicit",
      status: "active",
      appliesTo: {
        global: false,
        automationIds: [],
        artifactTypes: ["word"],
        capabilities: [],
      },
    });
    await ingestCorrectionSignal({
      userId: USER,
      text: "今後家計簿のカテゴリは食費と光熱費",
      source: "user_explicit",
    });
    await ingestCorrectionSignal({
      userId: USER,
      text: "会社用の文体は丁寧語で",
      source: "user_explicit",
    });

    const parsed = parseNaturalLanguageAutomation(MINIMAL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = await applyMemoryToAutomationCreate({
      userId: USER,
      text: MINIMAL,
      createInput: parsed.createInput,
    });
    expect(JSON.stringify(applied.snapshot.appliedPreferences)).not.toContain(
      "日付",
    );
    expect(JSON.stringify(applied.snapshot.appliedPreferences)).not.toContain(
      "report",
    );
    expect(JSON.stringify(applied.snapshot.appliedPreferences)).not.toContain(
      "食費",
    );
    expect(applied.labels.join("")).not.toContain("丁寧");

    const wordResolve = await resolveForContext({
      userId: USER,
      allowedScopes: ["word_template", "writing_style"],
      artifactTypes: ["word"],
    });
    expect(
      wordResolve.result.used.some((row) => row.value.length === "short"),
    ).toBe(false);
    expect(
      wordResolve.result.used.some((row) => row.scope === "word_template"),
    ).toBe(true);

    const excelResolve = await resolveForContext({
      userId: USER,
      allowedScopes: ["excel_template", "writing_style"],
      artifactTypes: ["xlsx"],
    });
    expect(
      excelResolve.result.used.some((row) => /家計簿|食費/.test(String(row.value.text ?? ""))),
    ).toBe(false);
  });
});

describe("STEP 16–17 repeat-use metrics", () => {
  it("2回目から指示が減り、スタイルは一致する", async () => {
    const firstEval = evaluateCorrectionForCandidate({
      userId: USER,
      text: DETAILED,
      source: "user_explicit",
    });
    expect(firstEval.action).toBe("explicit_active");
    await ingestCorrectionSignal({
      userId: USER,
      text: DETAILED,
      source: "user_explicit",
    });

    const parsed2 = parseNaturalLanguageAutomation(MINIMAL);
    expect(parsed2.ok).toBe(true);
    if (!parsed2.ok) return;
    const second = await applyMemoryToAutomationCreate({
      userId: USER,
      text: MINIMAL,
      createInput: parsed2.createInput,
    });
    const third = await applyMemoryToAutomationCreate({
      userId: USER,
      text: USUAL,
      createInput: parsed2.createInput,
    });

    expect(second.snapshot.appliedPreferences.length).toBe("short");
    expect(third.snapshot.appliedPreferences.length).toBe("short");
    expect(second.snapshot.appliedPreferences.emoji).toBe(
      third.snapshot.appliedPreferences.emoji,
    );
    expect(second.labels).toEqual(third.labels);
    expect(JSON.stringify(second.snapshot.appliedPreferences)).not.toContain(
      "家計簿",
    );

    const withoutMemoryInstruction = DETAILED.length;
    const withMemoryInstruction = MINIMAL.length;
    const delta = measureMemoryApplyDelta({
      instructionCharsBefore: withoutMemoryInstruction,
      instructionCharsAfter: withMemoryInstruction,
      correctionCountBefore: 4,
      correctionCountAfter: 0,
      beforeBody: "長めの営業文です😊😊 #a #b #c #d",
      afterBody: "短めです",
      memoryAppliedCount: second.snapshot.memoryIds.length,
      expectedChannel: "x_post",
      appliedChannels: ["x_post"],
    });
    expect(delta.instructionReductionRate).toBeGreaterThan(0.4);
    expect(delta.correctionCountDelta).toBe(-4);
    expect(delta.channelScopeCorrect).toBe(true);
    expect(MINIMAL.length).toBeLessThan(DETAILED.length * 0.5);
    expect(USUAL.length).toBeLessThan(MINIMAL.length);
  });
});

describe("STEP 12 / 18 / 19 cost, fallback, diagnostics", () => {
  it("Memory 適用のための追加 LLM は 0。固定文 overlay も AI なし", () => {
    expect(MEMORY_APPLY_EXTRA_LLM_CALLS).toBe(0);
    const overlay = applyPublishedBodyOverlay(
      "長い宣伝文です😊😊😊 #one #two #three #four",
      {
        injectionText: "",
        writingStyle: null,
        tone: null,
        forbiddenExpressions: [],
        signature: null,
        contactLines: [],
        workStyleNotes: [],
        ocrDictionary: {},
        visionHints: [],
        preferenceKeys: ["length:short"],
        preferShort: true,
        preferBullets: false,
        preferConclusionFirst: false,
        preferNoEmoji: false,
        preferHeadings: false,
        preferCta: false,
        preferSeo: false,
        ctaText: null,
        hashtagsMax: 2,
        preferFewEmoji: true,
      },
      "x_post",
    );
    expect((overlay.text.match(/#[^\s#]+/g) ?? []).length).toBeLessThanOrEqual(2);
    expect((overlay.text.match(/\p{Extended_Pictographic}/gu) ?? []).length).toBeLessThanOrEqual(1);
  });

  it("Memory unavailable でも自動化作成は壊れない", async () => {
    const parsed = parseNaturalLanguageAutomation(MINIMAL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const spy = vi
      .spyOn(personalMemoryService, "resolveForContext")
      .mockRejectedValueOnce(new Error("memory_unavailable"));
    const applied = await applyMemoryToAutomationCreate({
      userId: USER,
      text: MINIMAL,
      createInput: parsed.createInput,
    });
    spy.mockRestore();
    expect(applied.createInput.destination).toBe("x");
    expect(applied.extraLlmCalls).toBe(0);
    expect(applied.snapshot.source === "none" || applied.snapshot.source === "explicit").toBe(
      true,
    );
  });

  it("diagnostics に automation / memory / timings が入り Secret は入らない", async () => {
    await seedXStyleMemory();
    const parsed = parseNaturalLanguageAutomation(MINIMAL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = await applyMemoryToAutomationCreate({
      userId: USER,
      text: MINIMAL,
      createInput: parsed.createInput,
    });
    const diag = applied.createInput.workflow.metadata?.memoryDiagnostics as {
      userId: string;
      memoryIds: string[];
      memoryVersion: Record<string, string>;
      appliedPreferences: Record<string, unknown>;
      retrievalMs: number;
      applyMs: number;
      source: string;
    };
    expect(diag.userId).toBe(USER);
    expect(Array.isArray(diag.memoryIds)).toBe(true);
    expect(diag.memoryVersion).toBeTruthy();
    expect(diag.appliedPreferences).toBeTruthy();
    expect(typeof diag.retrievalMs).toBe("number");
    expect(typeof diag.applyMs).toBe("number");
    expect(JSON.stringify(diag)).not.toMatch(/Bearer |sk-|api[_-]?key/i);
  });
});

describe("deterministic merge helpers", () => {
  it("parses X social preference from natural language", () => {
    const pref = parseXSocialPreferenceFromText(
      "短めで絵文字少なめ、ハッシュタグ2個まで、実行前確認なし",
    );
    expect(pref.length).toBe("short");
    expect(pref.emoji).toBe("few");
    expect(pref.hashtagsMax).toBe(2);
    expect(pref.approval).toBe("full_auto");
  });
});
