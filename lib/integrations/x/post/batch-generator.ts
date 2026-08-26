import "server-only";

import { recordCostRun } from "@/lib/cost-optimization/cost-savings-tracker";
import {
  generateAutoPostText,
  isTooSimilar,
  selectPostType,
  capToTweetLength,
} from "./autopost-generator";
import {
  X_AUTOPOST_TYPE_LABELS,
  type XAutoPostSettings,
  type XAutoPostType,
} from "./autopost-types";
import {
  X_POST_BATCH_CHUNK_SIZE,
  X_POST_BATCH_ITEM_TIMEOUT_MS,
  X_POST_BATCH_MAX_DEDUP_ROUNDS,
  X_POST_BATCH_MAX_REGENERATE_PER_ITEM,
  X_POST_BATCH_OVERALL_TIMEOUT_MS,
  X_POST_BATCH_SIMILARITY_THRESHOLD,
} from "./batch-config";
import {
  applyHashtagPolicy,
  extractHashtags,
  sanitizeBatchPostText,
} from "./batch-safety";
import type { XPostBatch, XPostBatchItem } from "./batch-types";

export type BatchCopyGenerateResult = {
  text: string;
  angle: string;
  theme: string;
  hashtags: string[];
  usedFallback: boolean;
};

export type BatchCopyGenerator = (input: {
  batch: XPostBatch;
  item: XPostBatchItem;
  settings: XAutoPostSettings;
  postType: XAutoPostType;
  recentTexts: string[];
  memoryGuidance: string[];
}) => Promise<BatchCopyGenerateResult>;

const ANGLE_ORDER: XAutoPostType[] = [
  "problem",
  "knowhow",
  "question",
  "empathy",
  "service",
  "case",
  "cta",
  "oneline",
];

export function angleForSequence(sequence: number): {
  postType: XAutoPostType;
  label: string;
} {
  const postType = selectPostType(sequence - 1) || ANGLE_ORDER[(sequence - 1) % ANGLE_ORDER.length]!;
  return { postType, label: X_AUTOPOST_TYPE_LABELS[postType] };
}

export function buildBatchFallbackText(input: {
  batch: XPostBatch;
  sequence: number;
  angle: string;
}): string {
  const theme = input.batch.theme || input.batch.purpose || "お仕事";
  const audience = input.batch.audience || "お客様";
  const variants = [
    `${theme}で手が止まるときは、今日やることを一つに絞ると前に進みやすくなります。`,
    `${theme}の小さな見直しが、${audience}の負担を減らすことがあります。`,
    `${theme}について、いま一番整えたい点はどこでしょうか。`,
    `${audience}の皆さま、${theme}は続けることが力になります。`,
    `${theme}のご相談は、無理のない範囲から一緒に整理できます。`,
    `${theme}を短く振り返ると、次にやるべきことが見えてきます。`,
    `${theme}の情報を、役立つ範囲でお届けしています。`,
    `${theme}は、完璧より継続が近道です。`,
  ];
  const base = variants[(input.sequence - 1) % variants.length]!;
  const extra = input.angle ? `${base}（${input.angle}）` : base;
  return capToTweetLength(extra);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("generation_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const defaultBatchCopyGenerator: BatchCopyGenerator = async (input) => {
  const generated = await generateAutoPostText({
    settings: input.settings,
    postType: input.postType,
    recentTexts: input.recentTexts,
    slotKey: `${input.batch.id}:${input.item.sequence}`,
    memoryGuidance: input.memoryGuidance,
  });
  const sanitized = sanitizeBatchPostText(generated.text);
  const withPolicy = applyHashtagPolicy({
    text: sanitized.text,
    policy: input.batch.hashtagPolicy,
    theme: input.batch.theme,
  });
  return {
    text: capToTweetLength(withPolicy),
    angle: X_AUTOPOST_TYPE_LABELS[input.postType],
    theme: input.batch.theme,
    hashtags: extractHashtags(withPolicy),
    usedFallback: generated.usedFallback || sanitized.replaced,
  };
};

export async function generateBatchCopies(input: {
  batch: XPostBatch;
  items: XPostBatchItem[];
  settings: XAutoPostSettings;
  memoryGuidance: string[];
  recentTexts?: string[];
  generate?: BatchCopyGenerator;
  shouldCancel?: () => boolean;
  signal?: AbortSignal;
}): Promise<{
  items: XPostBatchItem[];
  generatedCount: number;
  failedCount: number;
  regenerateCount: number;
}> {
  const generate = input.generate ?? defaultBatchCopyGenerator;
  const started = Date.now();
  const recent = [...(input.recentTexts ?? [])];
  let regenerateCount = 0;
  const nextItems = input.items.map((item) => ({ ...item }));

  const targets = nextItems.filter(
    (item) => !item.text.trim() || item.status === "failed" || item.status === "generating",
  );

  for (let offset = 0; offset < targets.length; offset += X_POST_BATCH_CHUNK_SIZE) {
    if (input.shouldCancel?.() || input.signal?.aborted) break;
    if (Date.now() - started > X_POST_BATCH_OVERALL_TIMEOUT_MS) break;

    const chunk = targets.slice(offset, offset + X_POST_BATCH_CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (item) => {
        if (input.shouldCancel?.() || input.signal?.aborted) return;
        const { postType, label } = angleForSequence(item.sequence);
        try {
          const result = await withTimeout(
            generate({
              batch: input.batch,
              item,
              settings: input.settings,
              postType,
              recentTexts: recent,
              memoryGuidance: input.memoryGuidance,
            }),
            X_POST_BATCH_ITEM_TIMEOUT_MS,
          );
          const text = result.text.trim();
          if (!text) throw new Error("empty_generation");
          item.text = text;
          item.angle = result.angle || label;
          item.theme = result.theme || input.batch.theme;
          item.hashtags = result.hashtags;
          item.status = "ready";
          item.errorMessage = null;
          recent.push(text);
        } catch (error) {
          item.status = "failed";
          item.errorMessage =
            error instanceof Error && error.message === "generation_timeout"
              ? "生成が時間内に終わりませんでした。失敗した項目だけ再実行できます。"
              : "投稿文の作成に失敗しました。失敗した項目だけ再実行できます。";
        }
      }),
    );
  }

  let rounds = 0;
  while (rounds < X_POST_BATCH_MAX_DEDUP_ROUNDS) {
    if (input.shouldCancel?.() || input.signal?.aborted) break;
    const duplicates: XPostBatchItem[] = [];
    const seen: string[] = [...(input.recentTexts ?? [])];
    for (const item of nextItems) {
      if (!item.text.trim() || item.status === "failed") continue;
      if (isTooSimilar(item.text, seen, X_POST_BATCH_SIMILARITY_THRESHOLD)) {
        duplicates.push(item);
      } else {
        seen.push(item.text);
      }
    }
    if (duplicates.length === 0) break;
    rounds += 1;

    for (const item of duplicates) {
      if (item.regenerateCount >= X_POST_BATCH_MAX_REGENERATE_PER_ITEM) {
        item.status = "failed";
        item.errorMessage = "内容が近い投稿を十分に分けられませんでした。個別に再生成してください。";
        continue;
      }
      const { postType, label } = angleForSequence(item.sequence + rounds * 3);
      try {
        const result = await withTimeout(
          generate({
            batch: input.batch,
            item,
            settings: input.settings,
            postType,
            recentTexts: seen,
            memoryGuidance: [
              ...input.memoryGuidance,
              "直前の投稿と切り口・言い回しを変えること。",
            ],
          }),
          X_POST_BATCH_ITEM_TIMEOUT_MS,
        );
        item.regenerateCount += 1;
        regenerateCount += 1;
        const text = result.text.trim();
        if (!text || isTooSimilar(text, seen, X_POST_BATCH_SIMILARITY_THRESHOLD)) {
          item.status = "failed";
          item.errorMessage = "重複を避けた投稿を作成できませんでした。";
          continue;
        }
        item.text = text;
        item.angle = result.angle || label;
        item.hashtags = result.hashtags;
        item.status = "ready";
        item.errorMessage = null;
        seen.push(text);
      } catch {
        item.regenerateCount += 1;
        regenerateCount += 1;
        item.status = "failed";
        item.errorMessage = "重複項目の再生成に失敗しました。";
      }
    }
  }

  const generatedCount = nextItems.filter((item) => item.text.trim()).length;
  const failedCount = nextItems.filter((item) => item.status === "failed").length;
  recordCostRun({
    executionMode: "eco",
    estimatedCostUsd: generatedCount * 0.002,
    fromCache: false,
  });

  return { items: nextItems, generatedCount, failedCount, regenerateCount };
}

export async function regenerateSingleBatchItem(input: {
  batch: XPostBatch;
  item: XPostBatchItem;
  settings: XAutoPostSettings;
  memoryGuidance: string[];
  recentTexts: string[];
  generate?: BatchCopyGenerator;
}): Promise<XPostBatchItem> {
  if (input.item.regenerateCount >= X_POST_BATCH_MAX_REGENERATE_PER_ITEM) {
    return {
      ...input.item,
      status: "failed",
      errorMessage: "再生成の上限に達しました。本文を直接編集してください。",
    };
  }
  const { postType, label } = angleForSequence(
    input.item.sequence + input.item.regenerateCount + 1,
  );
  const generate = input.generate ?? defaultBatchCopyGenerator;
  try {
    const result = await withTimeout(
      generate({
        batch: input.batch,
        item: input.item,
        settings: input.settings,
        postType,
        recentTexts: input.recentTexts,
        memoryGuidance: [
          ...input.memoryGuidance,
          "前回と違う切り口で書くこと。",
        ],
      }),
      X_POST_BATCH_ITEM_TIMEOUT_MS,
    );
    const text = result.text.trim();
    if (!text) throw new Error("empty_generation");
    return {
      ...input.item,
      text,
      angle: result.angle || label,
      theme: result.theme || input.batch.theme,
      hashtags: result.hashtags,
      status: input.item.approvalStatus === "approved" ? "approved" : "ready",
      errorMessage: null,
      regenerateCount: input.item.regenerateCount + 1,
    };
  } catch (error) {
    return {
      ...input.item,
      status: "failed",
      regenerateCount: input.item.regenerateCount + 1,
      errorMessage:
        error instanceof Error && error.message === "generation_timeout"
          ? "再生成が時間内に終わりませんでした。"
          : "再生成に失敗しました。",
    };
  }
}
