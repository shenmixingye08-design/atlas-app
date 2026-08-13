/**
 * 【ATLAS機能評価】
 * 機能名：Memory TOP3（Automation本文適用 / 明示Preference即active / 修正学習接続）
 * ユーザー価値：同じ指示・修正を繰り返さず、X / WordPress / 成果物へ好みが自動反映される
 * 差別化：保存済みMemoryを実行stepの実本文へ機械適用（Run metadata止まりではない）
 * 繰り返し作業の削減：はい
 * AI必要度：不要（既存 resolve / overlay / extractCorrectionInsights）
 * AIなしで実装可能：はい
 * 運営コスト：追加AIなし
 * 外部APIコスト：無
 * コスト削減案：既存overlay再利用 / 再resolveは実行時1回 / 推測はcandidate維持
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
vi.mock("@/lib/integrations/x/post/service", () => ({
  postTweetNowForUser: vi.fn(),
}));
vi.mock("@/lib/integrations/wordpress/post/service", () => ({
  createWordPressPostForUser: vi.fn(),
}));
vi.mock("@/lib/automation-platform/execution/adapters/resolve-context", () => ({
  resolveAutomationFeatureContext: vi.fn(async () => ({})),
}));

import { invokeXPostAdapter } from "@/lib/automation-platform/execution/adapters/x-post";
import { invokeWordPressAdapter } from "@/lib/automation-platform/execution/adapters/wordpress";
import { applyMemoryForAutomation } from "@/lib/memory-apply/automation";
import { ingestCorrectionInsightsToPersonalMemory } from "@/lib/memory-apply/correction-preferences";
import { measureMemoryApplyDelta } from "@/lib/memory-apply/instruction-reduction";
import { applyMemoryToStepBody } from "@/lib/memory-apply/step-body";
import { detectMemoryChannel } from "@/lib/memory-apply/channels";
import { ingestCorrectionSignal, resolveForContext } from "@/lib/personal-memory/service";
import {
  clearAllPersonalMemoryData,
  listStoredPersonalMemories,
  writePersonalMemorySettings,
} from "@/lib/personal-memory/store";
import { selectRelevantMemories } from "@/lib/personal-memory/cost";
import { DEFAULT_PERSONAL_MEMORY_SETTINGS } from "@/lib/personal-memory/types";
import { evaluateCorrectionForCandidate } from "@/lib/personal-memory/candidates";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import { postTweetNowForUser } from "@/lib/integrations/x/post/service";
import { createWordPressPostForUser } from "@/lib/integrations/wordpress/post/service";

const USER_A = "user_memory_top3_a";
const USER_B = "user_memory_top3_b";

const LONG_X_BASELINE = [
  "MINERVOTはあなた専属のAI秘書です😊",
  "毎日の投稿作成を支援し、同じ指示を繰り返さなくてよい状態を目指しています🎉",
  "さらに詳しい背景として、習慣的な作業を記憶し、資料を整理し、改善案をご用意します🔥",
  "今回は製品の紹介として長めに書いています。",
  "最後に、ぜひフォローしてください✨",
].join("");

const LONG_WP_BASELINE = [
  "MINERVOTは仕事の記憶と自動化を支援するAI秘書です。",
  "記事では製品の背景、使い方、導入効果を丁寧に説明します。",
  "継続的なブログ運営では同じ修正を繰り返さないことが重要です。",
].join("\n\n");

function stubAutomation(userId: string): AutomationV2 {
  const now = new Date().toISOString();
  return {
    id: "auto_top3_x",
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
          configuration: { text: LONG_X_BASELINE },
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
      freeformNotes: "MINERVOTについてX投稿を作って",
    },
    memoryPolicy: {
      enabled: false,
      allowedScopes: [],
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
  clearAllPersonalMemoryData(USER_A);
  clearAllPersonalMemoryData(USER_B);
  writePersonalMemorySettings(USER_A, {
    ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
    enabled: true,
  });
  writePersonalMemorySettings(USER_B, {
    ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
    enabled: true,
  });
  vi.mocked(postTweetNowForUser).mockReset();
  vi.mocked(createWordPressPostForUser).mockReset();
});

describe("Memory TOP3 — Case A X", () => {
  it("explicit X preference applies to next X body without restating", async () => {
    const first = await applyMemoryToStepBody({
      userId: USER_A,
      channel: "x_post",
      baseline: LONG_X_BASELINE,
    });
    expect(first.text).toContain("😊");

    const saved = await ingestCorrectionSignal({
      userId: USER_A,
      text: "今後Xはもっと短く、絵文字なしにして",
      source: "user_explicit",
    });
    expect(saved?.status).toBe("active");
    expect(saved?.appliesTo.global).toBe(false);
    expect(saved?.appliesTo.artifactTypes).toContain("x_post");

    const second = await applyMemoryToStepBody({
      userId: USER_A,
      channel: "x_post",
      baseline: LONG_X_BASELINE,
    });
    expect(second.applied).toBe(true);
    expect(second.text.length).toBeLessThan(first.text.length);
    expect(second.text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(second.appliedKeys).toEqual(
      expect.arrayContaining(["length:short", "emoji:none"]),
    );

    const metrics = measureMemoryApplyDelta({
      instructionCharsBefore: "今後Xはもっと短く、絵文字なしにして".length,
      instructionCharsAfter: 0,
      correctionCountBefore: 1,
      correctionCountAfter: 0,
      beforeBody: first.text,
      afterBody: second.text,
      memoryAppliedCount: second.memoryIdsUsed.length,
      expectedChannel: "x_post",
      appliedChannels: second.channels,
    });
    expect(metrics.instructionReductionRate).toBe(1);
    expect(metrics.correctionCountDelta).toBeLessThan(0);
    expect(metrics.diffRate).toBeGreaterThan(0);
    expect(metrics.memoryAppliedCount).toBeGreaterThan(0);
    expect(metrics.channelScopeCorrect).toBe(true);
  });
});

describe("Memory TOP3 — Case B WordPress", () => {
  it("WordPress headings/CTA apply without leaking X short preference", async () => {
    await ingestCorrectionSignal({
      userId: USER_A,
      text: "今後Xはもっと短く、絵文字なしにして",
      source: "user_explicit",
    });
    await ingestCorrectionSignal({
      userId: USER_A,
      text: "WordPress記事は見出しを入れて、最後にCTAを入れて",
      source: "user_explicit",
    });

    const wp = await applyMemoryToStepBody({
      userId: USER_A,
      channel: "wordpress",
      baseline: LONG_WP_BASELINE,
    });
    expect(wp.applied).toBe(true);
    expect(wp.text).toMatch(/^## /m);
    expect(wp.text).toMatch(/詳しくはこちら/);
    expect(wp.appliedKeys).toEqual(
      expect.arrayContaining(["structure:headings", "cta"]),
    );

    const x = await applyMemoryToStepBody({
      userId: USER_A,
      channel: "x_post",
      baseline: LONG_X_BASELINE,
    });
    expect(x.text).not.toMatch(/^## /m);
    expect(x.text).not.toContain("詳しくはこちら");
    expect(x.text.length).toBeLessThan(LONG_X_BASELINE.length);
    expect(wp.appliedKeys).not.toContain("length:short");

    const isolation = measureMemoryApplyDelta({
      instructionCharsBefore: "WordPress記事は見出しを入れて、最後にCTAを入れて".length,
      instructionCharsAfter: 0,
      correctionCountBefore: 1,
      correctionCountAfter: 0,
      beforeBody: LONG_WP_BASELINE,
      afterBody: wp.text,
      memoryAppliedCount: wp.memoryIdsUsed.length,
      expectedChannel: "wordpress",
      appliedChannels: wp.channels,
    });
    expect(isolation.channelScopeCorrect).toBe(true);
    expect(isolation.instructionReductionRate).toBe(1);
  });
});

describe("Memory TOP3 — Case C Automation scheduler", () => {
  it("legacy default-off policy still applies latest X Memory to step body", async () => {
    await ingestCorrectionSignal({
      userId: USER_A,
      text: "今後Xはもっと短く、絵文字なしにして",
      source: "user_explicit",
    });

    const automation = stubAutomation(USER_A);
    const enqueue = await applyMemoryForAutomation({ automation });
    expect(enqueue.diagnostics.applied).toBe(true);
    expect(enqueue.ledger.memoryIdsUsed.length).toBeGreaterThan(0);

    const later = await applyMemoryToStepBody({
      userId: USER_A,
      channel: "x_post",
      baseline: LONG_X_BASELINE,
      automationId: automation.id,
    });
    expect(later.applied).toBe(true);
    expect(later.text).not.toBe(LONG_X_BASELINE);
    expect(later.text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("x_post adapter posts Memory-applied text, not the raw config", async () => {
    await ingestCorrectionSignal({
      userId: USER_A,
      text: "今後Xはもっと短く、絵文字なしにして",
      source: "user_explicit",
    });
    vi.mocked(postTweetNowForUser).mockResolvedValue({
      status: "ready",
      mode: "immediate",
      history: {
        id: "h1",
        userId: USER_A,
        text: "applied",
        mode: "immediate",
        status: "success",
        postedAt: new Date().toISOString(),
        tweetId: "tw_top3",
        tweetUrl: "https://x.com/i/web/status/tw_top3",
        errorMessage: null,
        scheduledFor: null,
        automationId: "auto_top3_x",
        validation: {
          charCount: 10,
          maxChars: 280,
          urls: [],
          mentions: [],
          hashtags: [],
          errors: [],
        },
        driveFileUrl: null,
      },
    } as never);

    const result = await invokeXPostAdapter({
      step: {
        id: "s_x",
        type: "x_post",
        name: "X投稿",
        order: 0,
        enabled: true,
        inputBindings: {},
        configuration: { text: LONG_X_BASELINE },
        requiresApproval: false,
        retryPolicy: { maxAttempts: 1, backoffMs: [0] },
        timeoutMs: 60_000,
        onSuccess: null,
        onFailure: null,
      },
      userId: USER_A,
      automationName: "定期X投稿",
      automationId: "auto_top3_x",
      runId: "run_top3",
      approved: true,
    });

    expect(result.ok).toBe(true);
    const posted = vi.mocked(postTweetNowForUser).mock.calls[0]?.[0];
    expect(posted?.text).toBeDefined();
    expect(posted?.text.length).toBeLessThan(LONG_X_BASELINE.length);
    expect(posted?.text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("Memory TOP3 — Case D correction learning", () => {
  it("repeated shorten corrections promote and reduce next diff", async () => {
    const before = LONG_X_BASELINE;
    const after = "MINERVOTはあなた専属のAI秘書です。";

    const first = await ingestCorrectionInsightsToPersonalMemory({
      userId: USER_A,
      before,
      after,
      artifactType: "x_post",
    });
    expect(first).toBeNull();
    await ingestCorrectionInsightsToPersonalMemory({
      userId: USER_A,
      before,
      after,
      artifactType: "x_post",
    });
    const third = await ingestCorrectionInsightsToPersonalMemory({
      userId: USER_A,
      before,
      after,
      artifactType: "x_post",
    });
    expect(third?.status).toBe("active");

    const next = await applyMemoryToStepBody({
      userId: USER_A,
      channel: "x_post",
      baseline: LONG_X_BASELINE,
    });
    expect(next.applied).toBe(true);
    expect(next.text.length).toBeLessThan(LONG_X_BASELINE.length);

    const metrics = measureMemoryApplyDelta({
      instructionCharsBefore: 0,
      instructionCharsAfter: 0,
      correctionCountBefore: 3,
      correctionCountAfter: 1,
      beforeBody: LONG_X_BASELINE,
      afterBody: next.text,
      memoryAppliedCount: next.memoryIdsUsed.length,
      expectedChannel: "x_post",
      appliedChannels: ["x_post"],
    });
    expect(metrics.correctionCountDelta).toBeLessThan(0);
    expect(metrics.diffRate).toBeGreaterThan(0);
  });

  it("one ambiguous correction stays inactive", async () => {
    const evaluated = evaluateCorrectionForCandidate({
      userId: USER_A,
      text: "ここを直して",
      source: "user_correction",
    });
    expect(evaluated.action).toBe("none");
  });
});

describe("Memory TOP3 — Case E scope isolation + user isolation", () => {
  it("X short and WordPress long/headings do not mix", async () => {
    expect(detectMemoryChannel("今後Xは短くして").channel).toBe("x_post");
    expect(detectMemoryChannel("WordPressでは丁寧な文章にして").channel).toBe(
      "wordpress",
    );
    expect(detectMemoryChannel("今後全部短くして").global).toBe(true);

    await ingestCorrectionSignal({
      userId: USER_A,
      text: "今後Xはもっと短く、絵文字なしにして",
      source: "user_explicit",
    });
    await ingestCorrectionSignal({
      userId: USER_A,
      text: "WordPressでは丁寧な文章にして、見出しを入れて",
      source: "user_explicit",
    });

    const memories = listStoredPersonalMemories(USER_A).filter(
      (m) => m.status === "active",
    );
    expect(memories.some((m) => m.appliesTo.artifactTypes.includes("x_post"))).toBe(
      true,
    );
    expect(
      memories.some((m) => m.appliesTo.artifactTypes.includes("wordpress")),
    ).toBe(true);

    const xMemory = memories.find((m) =>
      m.appliesTo.artifactTypes.includes("x_post"),
    );
    const wpMemory = memories.find((m) =>
      m.appliesTo.artifactTypes.includes("wordpress"),
    );
    expect(xMemory?.appliesTo.artifactTypes).toEqual(["x_post"]);
    expect(wpMemory?.appliesTo.artifactTypes).toEqual(["wordpress"]);
    expect(xMemory?.value.length).toBe("short");
    expect(xMemory?.appliesTo.global).toBe(false);
    expect(wpMemory?.appliesTo.global).toBe(false);

    const relevant = selectRelevantMemories({
      memories,
      artifactTypes: ["x_post"],
      allowedScopes: ["writing_style", "work_content_style"],
      settings: DEFAULT_PERSONAL_MEMORY_SETTINGS,
    });
    expect(relevant.map((m) => m.id)).toContain(xMemory!.id);
    expect(relevant.map((m) => m.id)).not.toContain(wpMemory!.id);

    const x = await applyMemoryToStepBody({
      userId: USER_A,
      channel: "x_post",
      baseline: LONG_X_BASELINE,
    });
    const wp = await applyMemoryToStepBody({
      userId: USER_A,
      channel: "wordpress",
      baseline: LONG_WP_BASELINE,
    });
    expect(x.memoryIdsUsed).toContain(xMemory!.id);
    expect(x.appliedKeys).toContain("length:short");
    expect(wp.appliedKeys).toContain("structure:headings");
    expect(wp.appliedKeys).not.toContain("length:short");
    expect(x.text).not.toMatch(/^## /m);
  });

  it("user B cannot receive user A memory", async () => {
    await ingestCorrectionSignal({
      userId: USER_A,
      text: "今後Xはもっと短く、絵文字なしにして",
      source: "user_explicit",
    });
    const b = await applyMemoryToStepBody({
      userId: USER_B,
      channel: "x_post",
      baseline: LONG_X_BASELINE,
    });
    expect(b.memoryIdsUsed).toEqual([]);
    expect(b.text).toContain("😊");
  });
});

describe("Memory TOP3 — word deliverable overlay", () => {
  it("word_generate overlay applies Memory without X leak", async () => {
    await ingestCorrectionSignal({
      userId: USER_A,
      text: "今後Xはもっと短く、絵文字なしにして",
      source: "user_explicit",
    });
    await ingestCorrectionSignal({
      userId: USER_A,
      text: "今後資料は短くして",
      source: "user_explicit",
    });
    const { applyMemoryForDeliverable } = await import(
      "@/lib/memory-apply/deliverables"
    );
    const applied = await applyMemoryForDeliverable({
      userId: USER_A,
      content: LONG_WP_BASELINE,
      format: "docx",
    });
    expect(applied.memoryIdsUsed.length).toBeGreaterThan(0);
    expect(applied.appliedPreferenceKeys).toContain("length:short");
    expect(applied.content).toContain("MINERVOT");
    expect(applied.content).not.toMatch(/^## /m);
  });
});

describe("Memory TOP3 — WordPress adapter body", () => {
  it("wordpress adapter sends heading/CTA body", async () => {
    await ingestCorrectionSignal({
      userId: USER_A,
      text: "WordPress記事は見出しを入れて、最後にCTAを入れて",
      source: "user_explicit",
    });
    vi.mocked(createWordPressPostForUser).mockResolvedValue({
      status: "posted",
      postId: 99,
      link: "https://example.com/?p=99",
      message: "ok",
    } as never);

    const result = await invokeWordPressAdapter({
      step: {
        id: "s_wp",
        type: "wordpress",
        name: "WP",
        order: 0,
        enabled: true,
        inputBindings: {},
        configuration: {
          title: "MINERVOT紹介",
          content: LONG_WP_BASELINE,
        },
        requiresApproval: false,
        retryPolicy: { maxAttempts: 1, backoffMs: [0] },
        timeoutMs: 60_000,
        onSuccess: null,
        onFailure: null,
      },
      userId: USER_A,
      automationName: "ブログ",
      automationId: "auto_wp",
      runId: "run_wp",
      approved: true,
    });
    expect(result.ok).toBe(true);
    const payload = vi.mocked(createWordPressPostForUser).mock.calls[0]?.[0];
    expect(payload?.payload.content).toMatch(/^## /m);
    expect(payload?.payload.content).toMatch(/詳しくはこちら/);
  });
});
