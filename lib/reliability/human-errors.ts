/**
 * Convert any technical failure into secretary-safe Japanese.
 * Never expose HTTP codes, stack traces, JSON, API, Token, etc.
 */

const FORBIDDEN =
  /\b(Error|Exception|Stack|Timeout|JSON|API|Token|Bearer|Webhook|OAuth|500|502|503|504|429|ETIMEDOUT|ECONNRESET|OPENAI|pdf-lib|TypeError|undefined|null)\b/i;

export function toHumanReliabilityMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : String(error ?? "unknown");

  if (/timeout|timed?\s*out|ETIMEDOUT/i.test(raw)) {
    return "通信が不安定でした。再試行しています。";
  }
  if (/429|rate.?limit/i.test(raw)) {
    return "混み合っています。少し待ってから自動で再試行しています。";
  }
  if (/502|503|504|500|network|ECONNRESET/i.test(raw)) {
    return "通信が不安定でした。再試行しています。";
  }
  if (/unauthorized|forbidden|401|403|oauth|token/i.test(raw)) {
    return "確認が必要です。連携の再接続をお願いします。";
  }
  if (/not found|404|expired/i.test(raw)) {
    return "成果物の用意をやり直しています。";
  }
  if (/empty|空白|blank|tofu|文字化け|json/i.test(raw)) {
    return "成果物を作り直しています。";
  }

  if (FORBIDDEN.test(raw) || raw.length > 160) {
    return "ただいま対応しています。完了次第お知らせします。";
  }

  // Already human enough
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(raw)) {
    return raw;
  }

  return "通信が不安定でした。再試行しています。";
}
