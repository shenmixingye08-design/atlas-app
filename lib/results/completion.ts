import type { DeliverableType } from "@/lib/orchestration/deliverable-types";
import type { Project } from "@/lib/projects/types";

/**
 * User-facing result derivation for the secretary-style result screen.
 *
 * Pure, client-safe helpers (no server-only or heavy display imports) so the
 * completion title, request intent, and destination can be unit tested and
 * reused by both the result view and its Next Actions bar. This layer never
 * exposes internal pipeline structure — it maps a finished job to what the user
 * actually cares about: what completed and what to do next.
 */

/** Where a completed job's primary next action is directed. */
export type ResultTargetType = "x_post" | "email" | "document";

/** Intent parsed from the original request, deciding the primary next action. */
export type ResultIntent =
  | "post_now"
  | "make_post"
  | "save_draft"
  | "schedule"
  | "revise"
  | "general";

const X_KEYWORDS =
  /(?:^|[^a-zA-Z])x(?:$|[^a-zA-Z])|ツイート|tweet|sns|ポスト|つぶや|x投稿|xへ|xに|エックス/i;
const POST_KEYWORDS = /投稿|ポスト|つぶや|ツイート|tweet/i;
const EMAIL_KEYWORDS = /メール|mail|e-?mail|gmail|返信|返事/i;
const DOCUMENT_TYPES: ReadonlySet<DeliverableType> = new Set([
  "blog",
  "report",
  "proposal",
  "presentation",
  "research",
]);

function requestText(project: Project): string {
  return `${project.workRequest ?? ""} ${project.result?.assignment ?? ""}`.trim();
}

/**
 * Classify the request intent so the result screen never has to ask
 * 「実行しますか？」 when the user has already been explicit.
 */
export function deriveResultIntent(request: string): ResultIntent {
  const text = request ?? "";
  if (!text.trim()) return "general";

  if (/直して|修正|書き直|書きなお|リライト|作り直|作りなお|手直し|直しといて/.test(text)) {
    return "revise";
  }

  if (/下書き|ドラフト|草案|下書きに|文面だけ|文面のみ|保存だけ|保存のみ/.test(text)) {
    return "save_draft";
  }

  // Only treat as scheduling when there is a concrete time-of-day / reservation
  // marker — a bare 「明日」 (which usually describes the topic, e.g.
  // 「明日のイベント告知を投稿しといて」) should stay an immediate post.
  const scheduleMarker =
    /予約|後で|あとで|(?:\d{1,2}|[一二三四五六七八九十]{1,3})\s*時|\d{1,2}\s*[:：]\s*\d{2}|午前|午後|早朝|朝|昼|夕方|夜|今夜|今晩/.test(
      text,
    );
  const postContext =
    X_KEYWORDS.test(text) || POST_KEYWORDS.test(text) || /送信|送る|配信/.test(text);
  if (scheduleMarker && postContext) {
    return "schedule";
  }

  if (
    /よろしく|投稿して|投稿しといて|投稿しておいて|ポストして|投稿お願い|投稿をお願い|上げて|公開して|アップして|つぶやいて|ツイートして|投稿頼/.test(
      text,
    )
  ) {
    return "post_now";
  }

  if (
    (X_KEYWORDS.test(text) || POST_KEYWORDS.test(text)) &&
    /作って|作成|考えて|用意|準備|文を|文章|案を|下さい|ください/.test(text)
  ) {
    return "make_post";
  }

  return "general";
}

/** Resolve the primary destination for a completed job. */
export function deriveTargetType(project: Project): ResultTargetType {
  const type = project.result?.deliverable?.type;
  const text = requestText(project);

  if (type === "social_post") return "x_post";
  if (type === "email") return "email";
  // Explicit document deliverables win over the broad 「投稿」 keyword
  // (e.g. 「ブログを投稿」 is a document, not an X post).
  if (type && DOCUMENT_TYPES.has(type)) return "document";

  if (X_KEYWORDS.test(text) || POST_KEYWORDS.test(text)) return "x_post";
  if (EMAIL_KEYWORDS.test(text)) return "email";
  return "document";
}

/**
 * Natural Japanese completion title — never the raw request string and never
 * the uniform 「成果物」. Derived from the job's destination, deliverable kind,
 * and request keywords.
 */
export function deriveCompletionTitle(project: Project): string {
  const request = requestText(project);
  const type = project.result?.deliverable?.type;
  const target = deriveTargetType(project);
  const hasDeliverable = Boolean(project.result?.deliverable);

  if (/家計簿|家計|支出|収支|レシート/.test(request) && /登録|記録|つけ|入力|反映|保存/.test(request)) {
    return "家計簿への登録が完了しました";
  }

  if (target === "x_post") return "X投稿文ができました";

  if (/返信|返事/.test(request)) return "返信文ができました";
  if (target === "email") return "メール文ができました";

  if (/要約|まとめ|サマリ|要点/.test(request)) return "要約ができました";

  switch (type) {
    case "blog":
      return "記事ができました";
    case "report":
      return "レポートができました";
    case "proposal":
      return "提案書ができました";
    case "presentation":
      return "資料ができました";
    case "research":
      return "調査結果ができました";
    case "email":
      return "メール文ができました";
    default:
      break;
  }

  if (!hasDeliverable) return "MINERVOTが準備しました";
  return "資料ができました";
}
