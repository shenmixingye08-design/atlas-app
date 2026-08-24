import { randomUUID } from "node:crypto";

import { estimateTokens } from "@/lib/ai/cost-meter";

import { assertPublishableCopy, findForbiddenClaim } from "./claims";
import {
  emptyMetrics,
  MAX_PUBLISH_ATTEMPTS,
  REVENUE_AGENT_CAMPAIGN,
  unknownMetricSources,
} from "./defaults";
import { isDuplicateOfAny } from "./duplicate";
import { insightHintsForPrompt } from "./insights";
import type {
  GenerateMode,
  GenerationCostRecord,
  RevenueContent,
  RevenueContentKind,
  RevenueGoals,
  RevenueInsights,
  RevenuePlatform,
  RevenueVideoPlan,
} from "./types";
import { buildRevenueUtmUrl } from "./utm";

const KINDS: RevenueContentKind[] = [
  "pain_point",
  "practical_knowhow",
  "minervot_use_case",
  "developer_experience",
  "comparison_before_after",
  "short_video",
];

export function tokyoDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function kindLabel(kind: RevenueContentKind): string {
  switch (kind) {
    case "pain_point":
      return "悩み起点";
    case "practical_knowhow":
      return "実用ノウハウ";
    case "minervot_use_case":
      return "利用例";
    case "developer_experience":
      return "開発者の体験";
    case "comparison_before_after":
      return "比較・前後";
    case "short_video":
      return "短尺動画";
    default:
      return kind;
  }
}

function videoPlan(title: string, hook: string, cta: string): RevenueVideoPlan {
  return {
    concept: title,
    script: `${hook}\n\n定型作業が毎日残る理由は、毎回ゼロから判断しているからです。\n覚えた仕事を秘書に渡す、という順だけを話します。\n\n${cta}`,
    durationSec: 30,
    telops: [hook.slice(0, 18), "毎回ゼロから決めない", cta.slice(0, 18)],
    cuts: [
      { atSec: 0, direction: "悩みを一文で出す" },
      { atSec: 8, direction: "手順を1つだけ示す" },
      { atSec: 20, direction: "LPまたは無料登録へ" },
    ],
    caption: `${hook} ${cta}`,
    hashtags: ["#MINERVOT", "#副業", "#個人事業"],
    thumbnailCopy: hook.slice(0, 22),
  };
}

function makeItem(input: {
  kind: RevenueContentKind;
  platform: RevenuePlatform;
  title: string;
  hook: string;
  body: string;
  cta: string;
  reason: string;
  goals: RevenueGoals;
  generationId: string;
  generationMode: "ai" | "template";
  now: Date;
}): RevenueContent {
  assertPublishableCopy(
    [input.title, input.hook, input.body, input.cta, input.reason],
    input.goals,
  );
  const id = `ra_${randomUUID()}`;
  const createdAt = input.now.toISOString();
  const video =
    input.kind === "short_video" ||
    input.platform === "tiktok" ||
    input.platform === "youtube_shorts"
      ? videoPlan(input.title, input.hook, input.cta)
      : null;

  return {
    id,
    campaign: REVENUE_AGENT_CAMPAIGN,
    status: input.goals.requireApproval ? "pending_approval" : "draft",
    kind: input.kind,
    platform: input.platform,
    title: input.title,
    hook: input.hook,
    body: `${input.body.trim()}\n\n${input.cta}`.trim(),
    cta: input.cta,
    recommendedPlatform: input.platform,
    assumedTarget: input.goals.targetAudience,
    desiredAction: "LP訪問または無料登録",
    reason: input.reason,
    video,
    utmUrl: buildRevenueUtmUrl({
      lpUrl: input.goals.lpUrl,
      platform: input.platform,
      kind: input.kind,
      contentId: id,
    }),
    scheduledAt: null,
    publishedAt: null,
    postUrl: null,
    xTweetId: null,
    idempotencyKey: `ra_pub_${id}`,
    attemptCount: 0,
    maxAttempts: MAX_PUBLISH_ATTEMPTS,
    lastError: null,
    metrics: emptyMetrics(),
    metricSource: unknownMetricSources(),
    generationMode: input.generationMode,
    createdAt,
    updatedAt: createdAt,
    generationId: input.generationId,
  };
}

export function buildTemplateBatch(input: {
  goals: RevenueGoals;
  existingBodies: string[];
  generationId: string;
  now?: Date;
}): RevenueContent[] {
  const now = input.now ?? new Date();
  const cta = input.goals.cta;
  const platform: RevenuePlatform = input.goals.platforms[0] ?? "x";
  const drafts: Array<Omit<Parameters<typeof makeItem>[0], "goals" | "generationId" | "generationMode" | "now">> = [
    {
      kind: "pain_point",
      platform,
      title: "毎日同じ作業が残る理由",
      hook: "毎日同じ資料作りが残っていませんか。",
      body: "副業や個人事業では、毎回ゼロから依頼文を書く時間が積み上がります。MINERVOTは仕事の進め方を覚え、次から秘書側で進めます。数字の実績はここでは述べません。",
      cta,
      reason: "悩み起点で、習慣作業の負担に寄せるため",
    },
    {
      kind: "practical_knowhow",
      platform,
      title: "依頼を一度で終わらせる書き方",
      hook: "依頼文に「完成形」を一文入れるだけで戻りが減ります。",
      body: "例：相手・期限・欲しい形を先に書く。MINERVOTへ頼むときも同じです。効果人数は未計測なので書きません。",
      cta,
      reason: "すぐ使える手順を1つに絞るため",
    },
    {
      kind: "minervot_use_case",
      platform,
      title: "X投稿を一度頼んで任せる",
      hook: "毎日のX投稿を、毎回チャットから始めなくてよい、という使い方です。",
      body: "MINERVOTは投稿文面の作成から、接続済みなら投稿までを仕事として受けます。利用者の声や売上は作らず、できる範囲だけ書きます。",
      cta,
      reason: "プロダクトの具体的な利用例を1つ示すため",
    },
    {
      kind: "developer_experience",
      platform,
      title: "作っている側が先に使っていること",
      hook: "運営自身が、繰り返し作業を秘書に渡す前提で開発しています。",
      body: "一般の導入社数や収益額は公表しません。自分たちの定型作業を減らすために、記憶と承認の流れを先に置いています。",
      cta,
      reason: "開発者体験に限り、架空の顧客事例を使わないため",
    },
    {
      kind: "comparison_before_after",
      platform,
      title: "毎回チャット vs 一度頼んで任せる",
      hook: "毎回プロンプトを書き直す時間と、一度頼んで次回から任せる時間は違います。",
      body: "前後の差は「毎回の入力が残るか」です。何分短縮できたかの数値は未計測なので出しません。",
      cta,
      reason: "比較を時間の残り方に限定するため",
    },
    {
      kind: "short_video",
      platform: input.goals.platforms.includes("tiktok")
        ? "tiktok"
        : input.goals.platforms.includes("youtube_shorts")
          ? "youtube_shorts"
          : "x",
      title: "30秒：依頼を一度で渡す",
      hook: "同じ作業を、また明日やっていませんか。",
      body: "15〜45秒。悩み→手順1つ→MINERVOTのLPまたは無料登録。効果数値は入れません。",
      cta,
      reason: "短尺用にカットとテロップを先に渡すため",
    },
  ];

  const items: RevenueContent[] = [];
  const bodies = [...input.existingBodies];
  for (const draft of drafts) {
    if (items.length >= 6) break;
    const probe = `${draft.title}\n${draft.body}`;
    if (isDuplicateOfAny(probe, bodies)) continue;
    try {
      const item = makeItem({
        ...draft,
        goals: input.goals,
        generationId: input.generationId,
        generationMode: "template",
        now,
      });
      items.push(item);
      bodies.push(item.body);
    } catch {
      // skip banned
    }
  }
  if (items.length < 3) {
    throw new Error("重複または禁止表現のため、3案を用意できませんでした");
  }
  return items;
}

type AiDraft = {
  kind?: string;
  platform?: string;
  title?: string;
  hook?: string;
  body?: string;
  cta?: string;
  reason?: string;
};

function parseAiDrafts(raw: string): AiDraft[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return Array.isArray(parsed) ? (parsed as AiDraft[]) : [];
  } catch {
    return [];
  }
}

function asKind(value: unknown): RevenueContentKind | null {
  return typeof value === "string" &&
    (KINDS as string[]).includes(value)
    ? (value as RevenueContentKind)
    : null;
}

function asPlatform(value: unknown, fallback: RevenuePlatform): RevenuePlatform {
  if (value === "x" || value === "tiktok" || value === "youtube_shorts") {
    return value;
  }
  return fallback;
}

export async function generateRevenueBatch(input: {
  goals: RevenueGoals;
  insights: RevenueInsights;
  existingBodies: string[];
  mode: GenerateMode;
}): Promise<{
  items: RevenueContent[];
  cost: GenerationCostRecord | null;
  generationId: string;
  usedAi: boolean;
}> {
  const generationId = `gen_${randomUUID()}`;
  const now = new Date();
  const fallback = input.goals.platforms[0] ?? "x";

  const { isOpenAIConfigured } = await import("@/lib/openai");
  if (!isOpenAIConfigured()) {
    return {
      items: buildTemplateBatch({
        goals: input.goals,
        existingBodies: input.existingBodies,
        generationId,
        now,
      }),
      cost: null,
      generationId,
      usedAi: false,
    };
  }

  const { createAtlasResponse } = await import("@/lib/openai");
  const { estimateTokenCostUsd } = await import("@/lib/ai/model-catalog");
  const { resolveTaskPolicy } = await import("@/lib/ai/policy-engine");

  const policy = resolveTaskPolicy("chat");
  const instructions = [
    "MINERVOT運営の集客企画をJSON配列だけで返す。",
    "最低3件、最大6件。各件は kind, platform, title, hook, body, cta, reason。",
    `kind は ${KINDS.join(", ")}。`,
    "存在しない利用者の声・売上・導入社数・効果数値を書いてはならない。",
    "誇大広告と『確実に稼げる』系は禁止。",
    "過去投稿の丸写し禁止。",
    insightHintsForPrompt(input.insights),
  ].join("\n");

  const prompt = [
    `目的: 副業者・個人事業主へMINERVOTを認知させ、LP訪問と無料登録を増やす`,
    `ターゲット: ${input.goals.targetAudience}`,
    `トーン: ${input.goals.brandTone}`,
    `CTA: ${input.goals.cta}`,
    `投稿先: ${input.goals.platforms.join(",")}`,
    `禁止: ${input.goals.bannedPhrases.join(" / ")}`,
    `LP: ${input.goals.lpUrl}`,
    `モード: ${input.mode}`,
    `含める種類: ${KINDS.map(kindLabel).join("、")}`,
  ].join("\n");

  const response = await createAtlasResponse({
    aiTaskType: "chat",
    temperature: 0.5,
    instructions,
    input: prompt,
  });
  const output = response.output_text ?? "";
  const inputTokens = estimateTokens(instructions + prompt);
  const outputTokens = estimateTokens(output);
  const cost: GenerationCostRecord = {
    id: `cost_${randomUUID()}`,
    at: now.toISOString(),
    generationId,
    model: response.model ?? policy.model,
    inputTokens,
    outputTokens,
    estimatedCostUsd: estimateTokenCostUsd({
      model: response.model ?? policy.model,
      inputTokens,
      outputTokens,
    }),
    ecoMode: true,
    batchSize: 0,
    cached: false,
  };

  const items: RevenueContent[] = [];
  const bodies = [...input.existingBodies];
  for (const draft of parseAiDrafts(output)) {
    const kind = asKind(draft.kind);
    if (!kind) continue;
    const title = String(draft.title ?? "").trim();
    const hook = String(draft.hook ?? "").trim();
    const body = String(draft.body ?? "").trim();
    const cta = String(draft.cta ?? input.goals.cta).trim();
    const reason = String(draft.reason ?? "").trim();
    if (!title || !hook || !body) continue;
    if (findForbiddenClaim(`${title}\n${hook}\n${body}\n${cta}`, input.goals)) {
      continue;
    }
    if (isDuplicateOfAny(`${title}\n${body}`, bodies)) continue;
    try {
      const item = makeItem({
        kind,
        platform: asPlatform(draft.platform, fallback),
        title,
        hook,
        body,
        cta,
        reason: reason || `${kindLabel(kind)}として、承認前の企画に残すため`,
        goals: input.goals,
        generationId,
        generationMode: "ai",
        now,
      });
      items.push(item);
      bodies.push(item.body);
    } catch {
      // skip
    }
  }

  if (items.length < 3) {
    const extras = buildTemplateBatch({
      goals: input.goals,
      existingBodies: bodies,
      generationId,
      now,
    });
    for (const extra of extras) {
      if (items.length >= 3) break;
      if (isDuplicateOfAny(extra.body, items.map((row) => row.body))) continue;
      items.push(extra);
    }
  }

  if (items.length < 3) {
    throw new Error("3案以上を重複なく生成できませんでした");
  }

  cost.batchSize = items.length;
  return { items, cost, generationId, usedAi: true };
}
