/**
 * 【ATLAS機能評価】
 * 機能名：Memory Chat Channel（destination / step type 優先）
 * ユーザー価値：チャットで「Xに投稿して」と言っても同じ好みを再入力しなくてよい
 * 差別化：content classifier の document 判定より投稿先・step type を優先
 * 繰り返し作業の削減：はい
 * AI必要度：不要
 * AIなしで実装可能：はい
 * 運営コスト：追加AIなし
 * 外部APIコスト：無
 * コスト削減案：既存 overlay / resolve 再利用
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

import { MemoryApply } from "@/lib/memory-apply/apply";
import {
  detectMemoryChannel,
  resolveMemoryArtifactTypes,
} from "@/lib/memory-apply/channels";
import { applyMemoryForAutomation } from "@/lib/memory-apply/automation";
import { overlayChatDestinationBody } from "@/lib/memory-apply/step-body";
import { ingestCorrectionSignal } from "@/lib/personal-memory/service";
import {
  clearAllPersonalMemoryData,
  writePersonalMemorySettings,
} from "@/lib/personal-memory/store";
import { DEFAULT_PERSONAL_MEMORY_SETTINGS } from "@/lib/personal-memory/types";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";

const USER = "user_memory_chat_channel";

const LONG_X = [
  "MINERVOTはあなた専属のAI秘書です😊",
  "毎日の投稿作成を支援し、同じ指示を繰り返さなくてよい状態を目指しています🎉",
  "さらに詳しい背景として、習慣的な作業を記憶し、資料を整理し、改善案をご用意します🔥",
  "今回は製品の紹介として長めに書いています。",
  "最後に、ぜひフォローしてください✨",
].join("");

const LONG_WP = [
  "MINERVOTは仕事の記憶と自動化を支援するAI秘書です。",
  "記事では製品の背景、使い方、導入効果を丁寧に説明します。",
  "継続的なブログ運営では同じ修正を繰り返さないことが重要です。",
].join("\n\n");

function stubXAutomation(): AutomationV2 {
  const now = new Date().toISOString();
  return {
    id: "auto_chat_x",
    userId: USER,
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
          configuration: { text: LONG_X },
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
      freeformNotes: "MINERVOTについてまとめて",
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
  clearAllPersonalMemoryData(USER);
  writePersonalMemorySettings(USER, {
    ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
    enabled: true,
  });
});

describe("Memory Chat Channel — destination beats document classifier", () => {
  it("detects Xに投稿して as x_post, not document", () => {
    expect(detectMemoryChannel("MINERVOTについてXに投稿して").channel).toBe(
      "x_post",
    );
    expect(
      resolveMemoryArtifactTypes({
        assignment: "MINERVOTについてXに投稿して",
        classifierTypes: ["document"],
      }),
    ).toEqual(["x_post"]);
  });

  it("detects WordPressに投稿して as wordpress even if classifier is document", () => {
    expect(
      detectMemoryChannel("MINERVOTについてWordPressに投稿して").channel,
    ).toBe("wordpress");
    expect(
      resolveMemoryArtifactTypes({
        assignment: "MINERVOTについてWordPressに投稿して",
        classifierTypes: ["document"],
      }),
    ).toEqual(["wordpress"]);
  });

  it("workflow x_post step beats document classifier", () => {
    expect(
      resolveMemoryArtifactTypes({
        assignment: "MINERVOTについてまとめて",
        stepTypes: ["x_post", "notify"],
        classifierTypes: ["document"],
      }),
    ).toEqual(["x_post"]);
  });

  it("workflow wordpress step beats document classifier", () => {
    expect(
      resolveMemoryArtifactTypes({
        assignment: "記事を作成して",
        stepTypes: ["wordpress"],
        classifierTypes: ["document"],
      }),
    ).toEqual(["wordpress"]);
  });
});

describe("Memory Chat Channel — X", () => {
  it("retrieves x_post Memory and overlays short / no-emoji onto the post body", async () => {
    await ingestCorrectionSignal({
      userId: USER,
      text: "今後Xはもっと短く、絵文字なしにして",
      source: "user_explicit",
    });

    const retrieved = await MemoryApply({
      userId: USER,
      channel: "commander",
      baseline: "MINERVOTについてXに投稿して",
      assignment: "MINERVOTについてXに投稿して",
      artifactTypes: ["document"],
    });
    expect(retrieved.context.memoryIdsUsed.length).toBeGreaterThan(0);

    const overlaid = await overlayChatDestinationBody({
      userId: USER,
      assignment: "MINERVOTについてXに投稿して",
      content: LONG_X,
    });
    expect(overlaid.channel).toBe("x_post");
    expect(overlaid.memoryIdsUsed.length).toBeGreaterThan(0);
    expect(overlaid.content.length).toBeLessThan(LONG_X.length);
    expect(overlaid.content).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(overlaid.appliedKeys).toEqual(
      expect.arrayContaining(["length:short", "emoji:none"]),
    );
  });
});

describe("Memory Chat Channel — WordPress", () => {
  it("retrieves wordpress Memory and overlays headings / CTA", async () => {
    await ingestCorrectionSignal({
      userId: USER,
      text: "WordPress記事は見出しを入れて、最後にCTAを入れて",
      source: "user_explicit",
    });

    const retrieved = await MemoryApply({
      userId: USER,
      channel: "commander",
      baseline: "MINERVOTについてWordPressに投稿して",
      assignment: "MINERVOTについてWordPressに投稿して",
      artifactTypes: ["document"],
    });
    expect(retrieved.context.memoryIdsUsed.length).toBeGreaterThan(0);

    const overlaid = await overlayChatDestinationBody({
      userId: USER,
      assignment: "MINERVOTについてWordPressに投稿して",
      content: LONG_WP,
    });
    expect(overlaid.channel).toBe("wordpress");
    expect(overlaid.content).toMatch(/^## /m);
    expect(overlaid.content).toMatch(/詳しくはこちら/);
    expect(overlaid.appliedKeys).toEqual(
      expect.arrayContaining(["structure:headings", "cta"]),
    );
  });
});

describe("Memory Chat Channel — scope isolation", () => {
  it("does not leak X prefs into WordPress or WordPress prefs into X", async () => {
    await ingestCorrectionSignal({
      userId: USER,
      text: "今後Xはもっと短く、絵文字なしにして",
      source: "user_explicit",
    });
    await ingestCorrectionSignal({
      userId: USER,
      text: "WordPress記事は見出しを入れて、最後にCTAを入れて",
      source: "user_explicit",
    });

    const x = await overlayChatDestinationBody({
      userId: USER,
      assignment: "MINERVOTについてXに投稿して",
      content: LONG_X,
    });
    const wp = await overlayChatDestinationBody({
      userId: USER,
      assignment: "MINERVOTについてWordPressに投稿して",
      content: LONG_WP,
    });

    expect(x.appliedKeys).toContain("length:short");
    expect(x.content).not.toMatch(/^## /m);
    expect(wp.appliedKeys).toContain("structure:headings");
    expect(wp.appliedKeys).not.toContain("length:short");
  });
});

describe("Memory Chat Channel — scheduler regression", () => {
  it("x_post workflow still resolves X Memory without chat classifier", async () => {
    await ingestCorrectionSignal({
      userId: USER,
      text: "今後Xはもっと短く、絵文字なしにして",
      source: "user_explicit",
    });
    const enqueue = await applyMemoryForAutomation({
      automation: stubXAutomation(),
    });
    expect(enqueue.diagnostics.applied).toBe(true);
    expect(enqueue.ledger.memoryIdsUsed.length).toBeGreaterThan(0);
  });
});
