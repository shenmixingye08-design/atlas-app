import type { CampaignVerdict } from "./types";

export const VERDICT_MIN_SIGNUPS = 10;
export const VERDICT_MIN_DAYS = 14;

export function resolveCampaignVerdict(input: {
  status?: CampaignVerdict;
  days: number;
  uniqueClicks: number | null;
  signups: number | null;
  firstSuccess: number | null;
  paid: number | null;
  cashYen: number | null;
  errors?: number | null;
}): CampaignVerdict {
  if (input.status === "stopped" || input.status === "draft" || input.status === "approved") {
    return input.status;
  }
  if (
    input.days < VERDICT_MIN_DAYS ||
    (input.signups ?? 0) < VERDICT_MIN_SIGNUPS ||
    input.signups == null
  ) {
    return "insufficient_data";
  }
  if ((input.errors ?? 0) > 0 && (input.firstSuccess ?? 0) === 0) {
    return "stop_candidate";
  }
  if ((input.cashYen ?? 0) > 0 && (input.paid ?? 0) > 0) {
    return "continue_candidate";
  }
  if ((input.signups ?? 0) > 0 && (input.paid ?? 0) === 0) {
    return "improve_candidate";
  }
  return "running";
}

export function buildVerdictSuggestion(input: {
  verdict: CampaignVerdict;
  measured: string;
}): {
  facts: string;
  interpretation: string;
  nextChange: string;
  verifyDays: number;
  success: string;
  stop: string;
} {
  return {
    facts: input.measured,
    interpretation:
      input.verdict === "insufficient_data"
        ? "サンプル不足のため、成功・停止は断定しません。"
        : "実測に基づく候補です。自動では採用しません。",
    nextChange: "フックかCTAの一方だけを変える。価格は変えない。",
    verifyDays: 14,
    success: "同じ期間で初回成功と入金が悪化しない",
    stop: "エラー増または初回成功が落ちたら戻す",
  };
}
