/**
 * Phase 2 Memory: 2nd request needs fewer restated instructions.
 * Deterministic contracts — no LLM judge.
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

import {
  buildPreferenceAppliedNotice,
  detectInstructionPreferenceItems,
  parseExplicitOverrideFromText,
  preferenceApplicationRate,
  stripKnownPreferencesFromInstruction,
} from "@/lib/memory-apply/instruction-reduction";
import { applyMemoryForDeliverable } from "@/lib/memory-apply/deliverables";
import { applyMemoryForAutomation } from "@/lib/memory-apply/automation";
import { applyMemoryToStepBody } from "@/lib/memory-apply/step-body";
import { ingestCorrectionSignal } from "@/lib/personal-memory/service";
import {
  clearAllPersonalMemoryData,
  writePersonalMemorySettings,
} from "@/lib/personal-memory/store";
import { DEFAULT_PERSONAL_MEMORY_SETTINGS } from "@/lib/personal-memory/types";
import { evaluateCorrectionForCandidate } from "@/lib/personal-memory/candidates";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";

const USER = "user_phase2_memory";

const FIRST_INSTRUCTION =
  "短めの社内報告書をWordで。丁寧にして。ハッシュタグは2個。";

function stubXAutomation(userId: string): AutomationV2 {
  const now = new Date().toISOString();
  return {
    id: "auto_phase2_x",
    userId,
    name: "定期X投稿",
    description: "MINERVOTのX投稿",
    status: "active",
    trigger: {
      type: "schedule",
      timezone: "Asia/Tokyo",
      schedule: {
        frequency: "daily",
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
  } as AutomationV2;
}

describe("Phase 2 Memory instruction reduction", () => {
  beforeEach(() => {
    clearAllPersonalMemoryData(USER);
    writePersonalMemorySettings(USER, {
      ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
      enabled: true,
      proposeFromCorrections: true,
    });
  });

  it("Scenario 1 vs 2: restated preference items drop after save", async () => {
    const scenario1Items = detectInstructionPreferenceItems(FIRST_INSTRUCTION);
    expect(scenario1Items).toEqual(
      expect.arrayContaining([
        "length:short",
        "format:docx",
        "tone:polite",
        "hashtags:max",
      ]),
    );

    const saved = await ingestCorrectionSignal({
      userId: USER,
      text: FIRST_INSTRUCTION,
      artifactType: "docx",
      source: "user_correction",
    });
    expect(saved?.status).toBe("active");

    const second = "今週分も作って";
    const stripped = stripKnownPreferencesFromInstruction({
      instruction: `${FIRST_INSTRUCTION} ${second}`,
      values: [
        {
          memoryId: saved!.id,
          scope: saved!.scope,
          key: saved!.key,
          summary: saved!.summary,
          value: saved!.value,
          appliesTo: saved!.appliesTo,
          confidence: saved!.confidence,
          sensitivity: "normal",
        },
      ],
    });

    expect(stripped.restatedItemsBefore.length).toBeGreaterThan(
      stripped.restatedItemsAfter.length,
    );
    expect(stripped.strippedKeys.length).toBeGreaterThanOrEqual(3);
    expect(detectInstructionPreferenceItems(second)).toHaveLength(0);
  });

  it("Preference application rate is 1 when overlay keys match saved keys", async () => {
    await ingestCorrectionSignal({
      userId: USER,
      text: "もっと簡潔に、見出し3つ",
      artifactType: "docx",
      source: "user_correction",
    });
    const applied = await applyMemoryForDeliverable({
      userId: USER,
      content:
        "導入が長い文章です。背景を詳しく述べます。結論は来週確定です。補足もあります。来月の予定も書きます。",
      format: "docx",
      assignment: "今週分も作って",
    });
    expect(applied.memoryApplied).toBe(true);
    const rate = preferenceApplicationRate({
      expectedKeys: ["length:short", "headingCount"],
      appliedKeys: applied.appliedPreferenceKeys,
    });
    expect(rate).toBe(1);
    expect(applied.content).toMatch(/^## /m);
    expect((applied.content.match(/^## /gm) ?? []).length).toBe(3);
    expect(applied.preferenceNotice).toMatch(/前回の好みを反映しました/);
  });

  it("今回は詳しく overrides saved short preference", async () => {
    await ingestCorrectionSignal({
      userId: USER,
      text: "今後は短めにして",
      source: "user_explicit",
    });
    const override = parseExplicitOverrideFromText("今回は詳しく書いて");
    expect(override.length).toBe("long");

    const longBase =
      "導入として背景を丁寧に説明します。市場の状況も述べます。結論は継続です。補足として来月の予定と採用計画、顧客フォローの三点を残します。さらにリスクも共有します。";
    const applied = await applyMemoryForDeliverable({
      userId: USER,
      content: longBase,
      format: "docx",
      assignment: "今回は詳しく今週分も作って",
    });
    expect(applied.content.length).toBeGreaterThan(longBase.length * 0.8);
    expect(applied.appliedPreferenceKeys).not.toContain("length:short");
  });

  it("does not store full user body as a standing preference", () => {
    const longBody = `# 報告書\n\n${"本文です。".repeat(80)}`;
    const evaluated = evaluateCorrectionForCandidate({
      userId: USER,
      text: "もっと簡潔に、見出し3つ",
      before: longBody,
      after: longBody.slice(0, 80),
      source: "user_correction",
    });
    expect(evaluated.action).toBe("candidate");
    const storedText = String(evaluated.input?.value.text ?? "");
    expect(storedText.length).toBeLessThanOrEqual(160);
    expect(storedText).not.toContain("本文です。本文です。本文です。");
  });

  it("one-shot 今日だけ is not persisted", () => {
    const evaluated = evaluateCorrectionForCandidate({
      userId: USER,
      text: "今日だけ短くして",
      source: "user_correction",
    });
    expect(evaluated.action).toBe("none");
  });

  it("notice does not lead with the word Memory", () => {
    const notice = buildPreferenceAppliedNotice(["短め", "Word"]);
    expect(notice).toBe("前回の好みを反映しました（短め、Word）");
    expect(notice).not.toMatch(/Memory|メモリ/i);
  });

  it("Automation reuses X tone / length / hashtags without re-entry", async () => {
    await ingestCorrectionSignal({
      userId: USER,
      text: "今後Xは短め、丁寧、ハッシュタグは2個にして",
      source: "user_explicit",
    });
    const auto = await applyMemoryForAutomation({
      automation: stubXAutomation(USER),
    });
    expect(auto.diagnostics.applied).toBe(true);
    expect(auto.contentOverlay.preferShort).toBe(true);
    expect(auto.contentOverlay.hashtagsMax).toBe(2);

    const body = await applyMemoryToStepBody({
      userId: USER,
      channel: "x_post",
      baseline:
        "今日の進捗です。詳細を長く書きます。補足もあります。#a #b #c #d",
    });
    expect(body.applied).toBe(true);
    expect((body.text.match(/#[^\s#]+/g) ?? []).length).toBeLessThanOrEqual(2);
  });
});
