import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/mock-responses", () => ({
  isMockLlmEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/openai", () => ({
  createAtlasResponse: vi.fn(),
}));

import { isMockLlmEnabled } from "@/lib/ai/mock-responses";
import { createAtlasResponse } from "@/lib/openai";
import { classifyXPostContent } from "@/lib/automation-platform/execution/x-post-content";
import {
  GENERATION_INSTRUCTIONS,
  generateXAutomationPostText,
} from "@/lib/automation-platform/execution/x-post-generate";
import {
  findForbiddenXPostClaims,
  isBrochureLikeXPost,
  selectXAutomationPostAngle,
} from "@/lib/automation-platform/execution/x-post-copy-quality";
import { extractXPostHashtags } from "@/lib/automation-platform/execution/x-post-hashtags";
import {
  resetXPostHistoryStore,
  saveXPostHistoryRecord,
} from "@/lib/integrations/x/post/history-store";
import type { XPostHistoryRecord } from "@/lib/integrations/x/post/types";

const isMockLlmEnabledMock = vi.mocked(isMockLlmEnabled);
const createAtlasResponseMock = vi.mocked(createAtlasResponse);

const MINERVOT_X_REQUEST = "毎日MINERVOTについて文章を考えてXに投稿して";

function classification() {
  return classifyXPostContent({
    configuration: { contentSource: "generate" },
    freeformNotes: MINERVOT_X_REQUEST,
    automationName: "SNS投稿の自動化",
  });
}

function historyRecord(
  partial: Pick<XPostHistoryRecord, "userId" | "text">,
): XPostHistoryRecord {
  return {
    id: `hist_${partial.text.slice(0, 8)}`,
    userId: partial.userId,
    text: partial.text,
    mode: "auto",
    status: "success",
    postedAt: new Date().toISOString(),
    tweetId: "tw_1",
    tweetUrl: "https://x.com/i/web/status/tw_1",
    errorMessage: null,
    scheduledFor: null,
    automationId: "auto_x",
    validation: {
      charCount: partial.text.length,
      maxChars: 280,
      urls: [],
      mentions: [],
      hashtags: [],
      errors: [],
    },
    driveFileUrl: null,
  };
}

describe("generateXAutomationPostText quality", () => {
  beforeEach(() => {
    isMockLlmEnabledMock.mockReturnValue(false);
    createAtlasResponseMock.mockReset();
    resetXPostHistoryStore();
  });

  it("sends quality instructions and a rotated angle to the model", async () => {
    createAtlasResponseMock.mockResolvedValue({
      output_text:
        "毎日のX投稿、何を書くかで止まる。テーマを決めておけばMINERVOTが本文まで進められる。",
    } as never);

    const result = await generateXAutomationPostText({
      classification: classification(),
      automationName: "SNS投稿の自動化",
      angleSeed: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.usedFallback).toBe(false);
    expect(result.angle).toBe(selectXAutomationPostAngle(2));
    expect(createAtlasResponseMock).toHaveBeenCalledTimes(1);
    const call = createAtlasResponseMock.mock.calls[0]?.[0];
    expect(call?.instructions).toBe(GENERATION_INSTRUCTIONS);
    expect(call?.instructions).toContain("1投稿1テーマ");
    expect(call?.instructions).toContain("企業パンフレット");
    expect(String(call?.input)).toContain(`今回の切り口: ${result.angle}`);
    expect(String(call?.input)).toContain(MINERVOT_X_REQUEST);
    expect(String(call?.input)).toContain("文体メモリ: なし");
  });

  it("uses Memory when present and still succeeds without it", async () => {
    createAtlasResponseMock.mockResolvedValue({
      output_text: "短めの投稿。Xの一文から任せる話。",
    } as never);

    const withMemory = await generateXAutomationPostText({
      classification: classification(),
      automationName: "SNS投稿の自動化",
      memoryInjection: "短め。ですます少なめ。",
      angleSeed: 0,
    });
    const withoutMemory = await generateXAutomationPostText({
      classification: classification(),
      automationName: "SNS投稿の自動化",
      angleSeed: 1,
    });

    expect(withMemory.ok).toBe(true);
    expect(withoutMemory.ok).toBe(true);
    expect(String(createAtlasResponseMock.mock.calls[0]?.[0]?.input)).toContain(
      "短め。ですます少なめ。",
    );
    expect(String(createAtlasResponseMock.mock.calls[1]?.[0]?.input)).toContain(
      "文体メモリ: なし",
    );
  });

  it("injects existing post history for dedup when userId is available", async () => {
    saveXPostHistoryRecord(
      historyRecord({
        userId: "user_x",
        text: "MINERVOTはAI秘書です。ぜひ利用してください。",
      }),
    );
    createAtlasResponseMock.mockResolvedValue({
      output_text:
        "一人で回してると投稿文だけで午前が終わる。テーマだけ渡して本文は任せる方が楽。",
    } as never);

    const result = await generateXAutomationPostText({
      classification: classification(),
      automationName: "SNS投稿の自動化",
      userId: "user_x",
      runId: "run_hist_1",
    });

    expect(result.ok).toBe(true);
    expect(String(createAtlasResponseMock.mock.calls[0]?.[0]?.input)).toContain(
      "MINERVOTはAI秘書です。ぜひ利用してください。",
    );
  });

  it("still succeeds when history lookup has nothing", async () => {
    createAtlasResponseMock.mockResolvedValue({
      output_text: "資料の下書きから渡すと、確認だけに集中できる。",
    } as never);

    const result = await generateXAutomationPostText({
      classification: classification(),
      automationName: "SNS投稿の自動化",
      userId: "user_empty",
    });
    expect(result.ok).toBe(true);
    expect(String(createAtlasResponseMock.mock.calls[0]?.[0]?.input)).toContain(
      "まだありません",
    );
  });

  it("selects hashtags in the same generate call without a second AI request", async () => {
    createAtlasResponseMock.mockResolvedValue({
      output_text:
        "副業の時間、投稿文を考えるだけで消える。テーマだけ決めて本文は任せる。",
    } as never);

    const withTags = await generateXAutomationPostText({
      classification: classification(),
      automationName: "SNS投稿の自動化",
      angleSeed: 1,
    });
    const withoutTags = await generateXAutomationPostText({
      classification: classification(),
      automationName: "SNS投稿の自動化",
      memoryInjection: "ハッシュタグ不要",
      angleSeed: 1,
    });

    expect(withTags.ok).toBe(true);
    expect(withoutTags.ok).toBe(true);
    if (withTags.ok) {
      expect((withTags.hashtags ?? []).length).toBeGreaterThanOrEqual(1);
      expect((withTags.hashtags ?? []).length).toBeLessThanOrEqual(2);
    }
    if (withoutTags.ok) {
      expect(withoutTags.hashtags).toEqual([]);
      expect(withoutTags.text).not.toMatch(/#/);
    }
    expect(createAtlasResponseMock).toHaveBeenCalledTimes(2);
  });

  it("keeps generation failure retryable and does not invent a brochure fallback", async () => {
    createAtlasResponseMock.mockRejectedValue(new Error("llm_down"));
    const result = await generateXAutomationPostText({
      classification: classification(),
      automationName: "SNS投稿の自動化",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("x_post_generation_failed");
    expect(result.errorMessage).toContain("自動作成に失敗");
  });

  it("virtually runs the same generate automation 5 times with distinct copy", async () => {
    createAtlasResponseMock.mockImplementation(async (input) => {
      const angle =
        /今回の切り口: ([a-z_]+)/.exec(String(input.input))?.[1] ?? "unknown";
      const samples: Record<string, string> = {
        chore_relatable:
          "毎日のX投稿、地味に何を書こうで止まる。テーマだけ決めてMINERVOTに本文を渡す。",
        automation_benefit:
          "同じ作業を毎回ゼロから始めるより、先に仕組みを置いた方が楽。完成したら知らせてくれる。",
        x_post_example:
          "X投稿の自動化は、毎朝の一文からが現実的。テーマを置いておけば本文まで進められる。",
        time_saved:
          "一人で回すと投稿文やメール下書きで午前が溶ける。文章作成を渡して、自分は確認に回る。",
        secretary_usage:
          "MINERVOTは雑談相手というより、予定整理や資料の下書きを渡すAI秘書。",
      };
      return {
        output_text: samples[angle] ?? `${angle}の話。X投稿を1テーマだけ。`,
      } as never;
    });

    const posts: string[] = [];
    const tagSets: string[] = [];
    for (let seed = 0; seed < 5; seed += 1) {
      const generated = await generateXAutomationPostText({
        classification: classification(),
        automationName: "SNS投稿の自動化",
        angleSeed: seed,
        runId: `run_virtual_${seed}`,
      });
      expect(generated.ok).toBe(true);
      if (!generated.ok) continue;
      posts.push(generated.text);
      const tags = generated.hashtags ?? extractXPostHashtags(generated.text);
      expect(tags.length).toBeLessThanOrEqual(2);
      tagSets.push(tags.join(" "));
      expect(findForbiddenXPostClaims(generated.text)).toEqual([]);
      expect(isBrochureLikeXPost(generated.text)).toBe(false);
    }

    expect(posts).toHaveLength(5);
    expect(new Set(posts).size).toBe(5);
    expect(createAtlasResponseMock).toHaveBeenCalledTimes(5);
    expect(new Set(tagSets).size).toBeGreaterThan(1);
  });
});
