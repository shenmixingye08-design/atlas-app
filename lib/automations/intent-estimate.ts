/**
 * Rule-based request intent estimation — no AI calls.
 * Used by new-request entry and automation wizard prefill.
 */

export type RequestTimingIntent = "once_now" | "once_scheduled" | "recurring";

export type RequestIntentEstimate = {
  timing: RequestTimingIntent;
  confidence: "high" | "medium" | "low";
  reason: string;
  suggestedTitle?: string;
};

const RECURRING =
  /毎日|毎週|毎月|平日|定期|習慣|自動で|ルーティン|定例|繰り返/i;
const SCHEDULED_ONCE =
  /(\d{1,2})月(\d{1,2})日|(\d{4})[-/](\d{1,2})[-/](\d{1,2})|明日|来週|来月|指定|日時/i;
const NOW = /今すぐ|すぐ| ASAP |急ぎ|本日中/i;

export function estimateRequestIntent(text: string): RequestIntentEstimate {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      timing: "once_now",
      confidence: "low",
      reason: "内容が未入力のため、今すぐ1回を初期値にしています。",
    };
  }

  if (RECURRING.test(trimmed)) {
    return {
      timing: "recurring",
      confidence: "high",
      reason: "繰り返しの表現が含まれているため、定期実行をおすすめします。",
      suggestedTitle: inferShortTitle(trimmed),
    };
  }

  if (SCHEDULED_ONCE.test(trimmed)) {
    return {
      timing: "once_scheduled",
      confidence: "medium",
      reason: "日時の指定がありそうなため、日時指定1回をおすすめします。",
    };
  }

  if (NOW.test(trimmed)) {
    return {
      timing: "once_now",
      confidence: "high",
      reason: "「今すぐ」の意向が読み取れるため、1回実行をおすすめします。",
    };
  }

  return {
    timing: "once_now",
    confidence: "medium",
    reason: "特に定期の指定がないため、まずは1回実行をおすすめします。",
  };
}

function inferShortTitle(text: string): string {
  if (/x|twitter|ツイート|sns|投稿/i.test(text)) return "SNS投稿";
  if (/ブログ|記事/i.test(text)) return "ブログ作成";
  if (/営業資料|提案資料|プレゼン/i.test(text)) return "営業資料";
  if (/メール|mail/i.test(text)) return "メール対応";
  if (/レポート|報告/i.test(text)) return "定期レポート";
  return "定期業務";
}
