import type { RevenueGoals } from "./types";

const FABRICATED_CLAIM =
  /(導入社数|導入企業|売上実績|有料会員\s*\d|登録者\s*\d+万人|確実に稼|必ず儲か|誰でも月収|効果が実証|成功率\s*\d+\s*%|平均\s*\d+\s*万円)/;

export function findForbiddenClaim(
  text: string,
  goals: Pick<RevenueGoals, "bannedPhrases">,
): string | null {
  const haystack = text.replace(/\s+/g, "");
  if (FABRICATED_CLAIM.test(text) || FABRICATED_CLAIM.test(haystack)) {
    return "存在しない実績・確実表現は使えません";
  }
  for (const phrase of goals.bannedPhrases) {
    const needle = phrase.trim();
    if (!needle) continue;
    if (text.includes(needle) || haystack.includes(needle.replace(/\s+/g, ""))) {
      return `禁止表現「${needle}」が含まれています`;
    }
  }
  return null;
}

export function assertPublishableCopy(
  parts: string[],
  goals: Pick<RevenueGoals, "bannedPhrases">,
): void {
  const joined = parts.filter(Boolean).join("\n");
  const reason = findForbiddenClaim(joined, goals);
  if (reason) {
    throw new Error(reason);
  }
}
