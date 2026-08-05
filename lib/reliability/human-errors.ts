/**
 * Convert any technical failure into secretary-safe Japanese.
 * Never expose HTTP codes, stack traces, JSON, API, Token, etc.
 * P06: user-facing failures always soft-retry — never an error screen.
 */

import { USER_SOFT_RETRY_MESSAGE } from "./ops-progress";

const FORBIDDEN =
  /\b(Error|Exception|Stack|Timeout|JSON|API|Token|Bearer|Webhook|OAuth|500|502|503|504|429|ETIMEDOUT|ECONNRESET|OPENAI|pdf-lib|TypeError|undefined|null)\b/i;

/**
 * User-visible message. P06 ban: technical error screens.
 * Default is the soft auto-retry copy.
 */
export function toHumanReliabilityMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : String(error ?? "unknown");

  // Auth may need user action — still soft, no stack/HTTP dump.
  if (/unauthorized|forbidden|401|403|oauth|token/i.test(raw)) {
    return "確認が必要です。連携の再接続をお願いします。";
  }

  // Everything else: auto-retry messaging only.
  if (
    /timeout|timed?\s*out|ETIMEDOUT|429|rate.?limit|502|503|504|500|network|ECONNRESET|storage|supabase|db_|database|save_failure|generation/i.test(
      raw,
    ) ||
    FORBIDDEN.test(raw) ||
    raw.length > 160 ||
    !/[\u3040-\u30ff\u3400-\u9fff]/.test(raw)
  ) {
    return USER_SOFT_RETRY_MESSAGE;
  }

  // Already soft Japanese — keep if it already conveys retry/progress.
  if (/再試行|対応しています|作り直|用意をやり直し/.test(raw)) {
    return raw;
  }

  return USER_SOFT_RETRY_MESSAGE;
}
