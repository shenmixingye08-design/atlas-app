import "server-only";

import { isMockLlmEnabled } from "@/lib/ai/mock-responses";
import { createAtlasResponse } from "@/lib/openai";
import { wrapCompactInstructions } from "@/lib/atlas-personality";

import { X_TWEET_MAX_CHARS } from "./validate";
import {
  X_AUTOPOST_TYPE_LABELS,
  X_AUTOPOST_TYPE_ORDER,
  type XAutoPostSettings,
  type XAutoPostType,
} from "./autopost-types";

export type GeneratedAutoPost = {
  text: string;
  postType: XAutoPostType;
  usedFallback: boolean;
};

/** Deterministically pick a post type so flavors rotate over time. */
export function selectPostType(seed: number): XAutoPostType {
  const index =
    ((Math.trunc(seed) % X_AUTOPOST_TYPE_ORDER.length) +
      X_AUTOPOST_TYPE_ORDER.length) %
    X_AUTOPOST_TYPE_ORDER.length;
  return X_AUTOPOST_TYPE_ORDER[index]!;
}

const POST_TYPE_GUIDANCE: Record<XAutoPostType, string> = {
  problem: "読み手が抱えがちな課題を提起し、共感を得る切り口。",
  knowhow: "すぐ使える具体的なノウハウやコツを1つ紹介する。",
  question: "読み手に問いかけ、反応を促す質問形式。",
  empathy: "読み手の気持ちに寄り添う共感の投稿。",
  service: "商品・サービスの価値をさりげなく紹介する。",
  case: "具体的な事例やビフォーアフターを簡潔に伝える。",
  cta: "次の行動（フォロー・返信・詳細確認など）を自然に促す。",
  oneline: "印象に残る短い一言。装飾は最小限。",
};

const GENERATION_INSTRUCTIONS = wrapCompactInstructions(
  `あなたはお客様専属のAI秘書として、X（旧Twitter）に投稿する日本語の文章を1件だけ作成します。
出力ルール:
- 本文のみを出力する（前置き・説明・鉤括弧・コードブロックは書かない）。
- 全体で280文字以内（日本語1文字も1文字として数える）。
- 自然で読みやすい日本語。過度な絵文字や誇張、事実でない実績は書かない。
- 直近の投稿と内容・言い回しが重複しないようにする。
- 指定された投稿タイプの狙いに沿って書く。
- ハッシュタグは指示があるときのみ1〜2個、末尾に付ける。`,
);

function buildGenerationInput(input: {
  settings: XAutoPostSettings;
  postType: XAutoPostType;
  recentTexts: string[];
}): string {
  const { settings, postType, recentTexts } = input;
  const themes =
    settings.themes.length > 0 ? settings.themes.join(" / ") : "（指定なし）";
  const recent =
    recentTexts.length > 0
      ? recentTexts
          .slice(0, 8)
          .map((text, index) => `${index + 1}. ${text.replace(/\s+/g, " ")}`)
          .join("\n")
      : "（まだありません）";

  return [
    `投稿の目的: ${settings.purpose || "（指定なし）"}`,
    `テーマ: ${themes}`,
    `読み手: ${settings.audience || "（指定なし）"}`,
    `トーン: ${settings.tone || "（指定なし）"}`,
    `投稿タイプ: ${X_AUTOPOST_TYPE_LABELS[postType]} — ${POST_TYPE_GUIDANCE[postType]}`,
    `ハッシュタグ: ${settings.includeHashtags ? "1〜2個付ける" : "付けない"}`,
    "",
    "直近の投稿（これらと重複しないこと）:",
    recent,
  ].join("\n");
}

/** Strip wrapping quotes / code fences the model may add. */
function sanitizeGeneratedText(raw: string): string {
  let text = raw.trim();
  const fence = /^```(?:\w+)?\s*([\s\S]*?)```$/.exec(text);
  if (fence) text = fence[1]!.trim();
  text = text.replace(/^["'「『]+/, "").replace(/["'」』]+$/, "");
  return text.trim();
}

/** Hard cap to 280 characters, trimming on a sentence/space boundary. */
export function capToTweetLength(text: string): string {
  const chars = [...text.trim()];
  if (chars.length <= X_TWEET_MAX_CHARS) return text.trim();

  const truncated = chars.slice(0, X_TWEET_MAX_CHARS).join("");
  const boundary = Math.max(
    truncated.lastIndexOf("。"),
    truncated.lastIndexOf("\n"),
    truncated.lastIndexOf(" "),
  );
  if (boundary >= X_TWEET_MAX_CHARS - 40) {
    return truncated.slice(0, boundary + 1).trim();
  }
  return truncated.trim();
}

/** Normalize text for near-duplicate comparison. */
function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#＃@＠][\w\p{L}\p{N}_]+/gu, "")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function bigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < text.length - 1; i += 1) {
    set.add(text.slice(i, i + 2));
  }
  return set;
}

/** True when candidate is essentially the same as a recent post. */
export function isTooSimilar(
  candidate: string,
  recentTexts: string[],
  threshold = 0.82,
): boolean {
  const normalizedCandidate = normalizeForCompare(candidate);
  if (!normalizedCandidate) return false;

  for (const recent of recentTexts) {
    const normalizedRecent = normalizeForCompare(recent);
    if (!normalizedRecent) continue;
    if (normalizedCandidate === normalizedRecent) return true;

    const a = bigrams(normalizedCandidate);
    const b = bigrams(normalizedRecent);
    if (a.size === 0 || b.size === 0) continue;
    let intersection = 0;
    for (const gram of a) {
      if (b.has(gram)) intersection += 1;
    }
    const jaccard = intersection / (a.size + b.size - intersection);
    if (jaccard >= threshold) return true;
  }

  return false;
}

/** Deterministic, non-AI fallback used when the LLM is mocked or fails. */
export function buildFallbackAutoPost(input: {
  settings: XAutoPostSettings;
  postType: XAutoPostType;
  slotKey: string;
}): string {
  const { settings, postType, slotKey } = input;
  const theme = settings.themes[0] ?? settings.purpose ?? "お仕事";
  const audience = settings.audience || "お客様";

  const templates: Record<XAutoPostType, string> = {
    problem: `${theme}で、思うように進まないと感じることはありませんか。まずは一つずつ整理していくことが、解決への近道になります。`,
    knowhow: `${theme}のちょっとしたコツ: 最初に「今日やること」を一つだけ決めておくと、迷わず進められます。`,
    question: `${theme}について、いま一番お困りのことは何でしょうか。ぜひ教えてください。`,
    empathy: `${theme}に取り組む${audience}の皆さま、日々おつかれさまです。少しずつでも前に進めていきましょう。`,
    service: `${theme}に関するご相談を承っております。お困りごとがございましたら、お気軽にお声がけください。`,
    case: `${theme}を見直したことで、作業の手間が減ったという声をいただいています。小さな改善の積み重ねが力になります。`,
    cta: `${theme}に関する情報を発信しています。お役に立てそうでしたら、フォローしていただけると嬉しいです。`,
    oneline: `${theme}は、続けることが一番の近道です。`,
  };

  let text = templates[postType];
  if (settings.includeHashtags) {
    const tag = (settings.themes[0] ?? "").replace(/\s+/g, "");
    if (tag) text = `${text} #${tag}`;
  }
  // Keep the slotKey out of the visible text but ensure minor variance so two
  // different fallback slots on the same day are not byte-identical.
  void slotKey;
  return capToTweetLength(text);
}

/**
 * Generate one X post. Uses AI ONLY for the copy; everything else is normal
 * code. Falls back to a deterministic template when the LLM is unavailable.
 */
export async function generateAutoPostText(input: {
  settings: XAutoPostSettings;
  postType: XAutoPostType;
  recentTexts: string[];
  slotKey: string;
}): Promise<GeneratedAutoPost> {
  const fallback = () =>
    buildFallbackAutoPost({
      settings: input.settings,
      postType: input.postType,
      slotKey: input.slotKey,
    });

  if (isMockLlmEnabled()) {
    return { text: fallback(), postType: input.postType, usedFallback: true };
  }

  try {
    const response = await createAtlasResponse({
      input: buildGenerationInput(input),
      instructions: GENERATION_INSTRUCTIONS,
      aiTaskType: "worker_deliverable_light",
      maxOutputTokens: 400,
    });

    const text = capToTweetLength(
      sanitizeGeneratedText(response.output_text ?? ""),
    );
    if (!text) {
      return { text: fallback(), postType: input.postType, usedFallback: true };
    }
    return { text, postType: input.postType, usedFallback: false };
  } catch (error) {
    console.warn("[X AutoPost] copy generation failed");
    if (error instanceof Error) {
      console.warn("[X AutoPost] generation detail:", error.message);
    }
    return { text: fallback(), postType: input.postType, usedFallback: true };
  }
}
