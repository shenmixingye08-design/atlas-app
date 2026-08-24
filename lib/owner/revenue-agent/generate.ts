import { randomUUID } from "node:crypto";

import { estimateTokens } from "@/lib/ai/cost-meter";
import { getPlanDefinition } from "@/lib/billing/plans/registry";
import { lightPlanYenLabel } from "@/lib/landing/pay-reason";

import { assertPublishableCopy, findForbiddenClaim } from "./claims";
import { DEFAULT_GROWTH_PATH, REVENUE_AGENT_CAMPAIGN_ID } from "./constants";
import {
  emptyMetrics,
  MAX_PUBLISH_ATTEMPTS,
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
import {
  buildRevenueTrackingUrl,
  buildRevenueUtmUrl,
} from "./utm";

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
  painPoint: string;
  intent: string;
  featureExample: string;
  assumedTarget?: string;
  goals: RevenueGoals;
  generationId: string;
  generationMode: "ai" | "template";
  now: Date;
}): RevenueContent {
  const claimHit = findForbiddenClaim(
    [input.title, input.hook, input.body, input.cta, input.reason].join("\n"),
    input.goals,
  );
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
  const utmUrl = buildRevenueUtmUrl({
    lpUrl: input.goals.lpUrl || DEFAULT_GROWTH_PATH,
    platform: input.platform,
    kind: input.kind,
    contentId: id,
    campaignId: REVENUE_AGENT_CAMPAIGN_ID,
  });
  const trackingUrl = buildRevenueTrackingUrl({ contentId: id });

  return {
    id,
    campaign: REVENUE_AGENT_CAMPAIGN_ID,
    campaignId: REVENUE_AGENT_CAMPAIGN_ID,
    contentId: id,
    status: input.goals.requireApproval ? "pending_approval" : "draft",
    kind: input.kind,
    platform: input.platform,
    title: input.title,
    hook: input.hook,
    body: `${input.body.trim()}\n\n${input.cta}\n${trackingUrl}`.trim(),
    cta: input.cta,
    recommendedPlatform: input.platform,
    assumedTarget: input.assumedTarget?.trim() || input.goals.targetAudience,
    painPoint: input.painPoint,
    intent: input.intent,
    featureExample: input.featureExample,
    signupPath: DEFAULT_GROWTH_PATH,
    desiredAction: "無料登録",
    reason: input.reason,
    claimCheck: {
      ok: !claimHit,
      hits: claimHit ? [claimHit] : [],
    },
    video,
    utmUrl,
    trackingUrl,
    scheduledAt: null,
    publishedAt: null,
    postUrl: null,
    xTweetId: null,
    idempotencyKey: `ra_pub_${id}`,
    attemptCount: 0,
    maxAttempts: MAX_PUBLISH_ATTEMPTS,
    lastError: null,
    failedStage: null,
    retryable: false,
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
  const lightPrice = lightPlanYenLabel();
  const lightPlan = getPlanDefinition("light");
  const freePlan = getPlanDefinition("free");
  const featureX =
    lightPlan.limits.features.includes("sns_assist") &&
    lightPlan.limits.features.includes("sns_auto_post");
  const featureWriting = lightPlan.limits.features.includes("content_writing");
  const drafts: Array<Omit<Parameters<typeof makeItem>[0], "goals" | "generationId" | "generationMode" | "now">> = [
    {
      kind: "pain_point",
      platform,
      title: "毎週同じ作業が残る理由",
      hook: "毎週・毎月、同じ作業を自分で繰り返していませんか。",
      body: `副業や個人事業では、X投稿・資料作成・予定の確認が毎週残ります。MINERVOTは仕事の進め方を覚え、次から秘書側で進めます。${freePlan.monthlyPriceJpy === 0 ? "無料で試してから判断できます。" : ""}価格の実績人数は書きません。`,
      cta,
      reason: "悩み起点で、習慣作業の負担に寄せるため",
      painPoint: "毎週・毎月の繰り返し作業が自分の時間を削っている",
      intent: "無料登録へつなぎ、繰り返し作業を秘書へ渡す第一歩を示す",
      featureExample: featureWriting
        ? "資料作成や依頼文を、一度やり方を伝えたあと秘書に任せる"
        : "覚えた仕事を次から秘書側で進める",
      assumedTarget: "副業者・個人事業主",
    },
    {
      kind: "practical_knowhow",
      platform,
      title: "依頼を一度で終わらせる書き方",
      hook: "依頼文に「完成形」を一文入れるだけで戻りが減ります。",
      body: "例：相手・期限・欲しい形を先に書く。MINERVOTへ頼むときも同じです。効果人数は未計測なので書きません。",
      cta,
      reason: "すぐ使える手順を1つに絞るため",
      painPoint: "毎回ゼロから依頼内容を書き直している",
      intent: "一度の依頼で次回から任せられる形を見せ、無料登録へつなぐ",
      featureExample: "相手・期限・欲しい形を先に書いて依頼する",
      assumedTarget: "副業者・個人事業主",
    },
    {
      kind: "minervot_use_case",
      platform,
      title: "X投稿を一度頼んで任せる",
      hook: "毎日のX投稿を、毎回チャットから始めなくてよい、という使い方です。",
      body: `${featureX ? "MINERVOTは投稿文面の作成から、接続済みなら投稿までを仕事として受けます。" : "MINERVOTは投稿文面の作成を仕事として受けます。"}合えば月${lightPrice}から。利用者の声や売上は作らず、できる範囲だけ書きます。`,
      cta,
      reason: "プロダクトの具体的な利用例を1つ示すため",
      painPoint: "毎日のX投稿を自分で一から考えている",
      intent: "実在するX投稿支援を示し、無料登録へつなぐ",
      featureExample: featureX
        ? "X投稿文の作成と、接続済みなら投稿までを依頼する"
        : "X投稿文の作成を依頼する",
      assumedTarget: "副業者・個人事業主",
    },
    {
      kind: "developer_experience",
      platform,
      title: "作っている側が先に使っていること",
      hook: "運営自身が、繰り返し作業を秘書に渡す前提で開発しています。",
      body: "一般の導入社数や収益額は公表しません。自分たちの定型作業を減らすために、記憶と承認の流れを先に置いています。",
      cta,
      reason: "開発者体験に限り、架空の顧客事例を使わないため",
      painPoint: "自分でも毎週残る作業を、先に秘書へ渡していない",
      intent: "運営自身の使い方に限り、無料登録の判断材料にする",
      featureExample: "承認してから実行する流れで、定型作業を秘書に渡す",
      assumedTarget: "副業者・個人事業主",
    },
    {
      kind: "comparison_before_after",
      platform,
      title: "毎回チャット vs 一度頼んで任せる",
      hook: "毎回プロンプトを書き直す時間と、一度頼んで次回から任せる時間は違います。",
      body: `前後の差は「毎回の入力が残るか」です。何分短縮できたかの数値は未計測なので出しません。無料で試せます。合えば月${lightPrice}から。`,
      cta,
      reason: "比較を時間の残り方に限定するため",
      painPoint: "毎回同じ説明をチャットに書き直している",
      intent: "一度頼んで任せる形を示し、無料登録へつなぐ",
      featureExample: "スケジュールや資料の決まり切った依頼を、次回から秘書側で進める",
      assumedTarget: "副業者・個人事業主",
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
      body: `15〜45秒。悩み→手順1つ→MINERVOTの無料登録。効果数値は入れません。合えば月${lightPrice}から。`,
      cta,
      reason: "短尺用にカットとテロップを先に渡すため",
      painPoint: "同じ作業を翌日も自分でやっている",
      intent: "短尺で無料登録へつなぐ",
      featureExample: featureX
        ? "X投稿や資料作成を一度頼んで任せる"
        : "資料作成を一度頼んで任せる",
      assumedTarget: "副業者・個人事業主",
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
  painPoint?: string;
  intent?: string;
  featureExample?: string;
  assumedTarget?: string;
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
    "最低3件、最大6件。各件は kind, platform, title, hook, body, cta, reason, painPoint, intent, featureExample, assumedTarget。",
    `kind は ${KINDS.join(", ")}。`,
    "対象は副業者・個人事業主。無料登録 (/sign-up) へつなぐ。",
    "実在機能だけを書く: X投稿支援、資料作成、スケジュール、自動化。画像・動画生成は書かない。",
    `価格は月${lightPlanYenLabel()}から、と無料で試せる、以外の金額を作らない。`,
    "存在しない利用者の声・売上・導入社数・効果数値・推定クリックを書いてはならない。",
    "誇大広告と『確実に稼げる』系は禁止。",
    "過去投稿の丸写し禁止。与えられた実測以外の成果を補完しない。",
    insightHintsForPrompt(input.insights),
  ].join("\n");

  const prompt = [
    `目的: 副業者・個人事業主へMINERVOTを認知させ、無料登録 (/sign-up) を増やす`,
    `ターゲット: ${input.goals.targetAudience}`,
    `トーン: ${input.goals.brandTone}`,
    `CTA: ${input.goals.cta}`,
    `投稿先: ${input.goals.platforms.join(",")}`,
    `禁止: ${input.goals.bannedPhrases.join(" / ")}`,
    `登録導線: ${DEFAULT_GROWTH_PATH}`,
    `確認済み価格: Light 月${lightPlanYenLabel()} / Free は月額0円で試せる`,
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
    const painPoint = String(draft.painPoint ?? "").trim();
    const intent = String(draft.intent ?? "").trim();
    const featureExample = String(draft.featureExample ?? "").trim();
    const assumedTarget = String(draft.assumedTarget ?? "").trim();
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
        painPoint: painPoint || "毎週・毎月の繰り返し作業が残っている",
        intent: intent || "無料登録へつなぐ",
        featureExample:
          featureExample || "X投稿・資料作成・スケジュールを秘書へ依頼する",
        assumedTarget: assumedTarget || "副業者・個人事業主",
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
