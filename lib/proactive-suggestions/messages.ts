import type { Automation } from "@/lib/automations/types";
import { formatDeliverablePreference } from "@/lib/user-profile/labels";
import type { UserWorkProfile } from "@/lib/user-profile/types";

import type { SuggestionTimeContext } from "./types";

function matchesAutomation(
  automation: Automation,
  patterns: RegExp[],
): boolean {
  const text = `${automation.id} ${automation.name} ${automation.description} ${automation.workflow.assignment}`;
  return patterns.some((pattern) => pattern.test(text));
}

export function buildScheduledHabitMessage(
  automation: Automation,
  context: SuggestionTimeContext,
  profile: UserWorkProfile,
): string {
  if (
    matchesAutomation(automation, [/ココナラ|coconala/i]) &&
    context.dayOfWeek === 3
  ) {
    return `今日は${context.weekdayLabel}です。ココナラ募集を更新しますか？`;
  }

  if (matchesAutomation(automation, [/ブログ|blog|記事/i])) {
    return "毎週ブログを書く予定です。今週分を作成しますか？";
  }

  if (matchesAutomation(automation, [/営業資料|プレゼン|sales/i])) {
    const format = profile.preferredFormats.sales_material;
    const formatLabel = formatDeliverablePreference(format) ?? "PowerPoint";
    return `営業資料の作成日です。${formatLabel}を作成しますか？`;
  }

  if (matchesAutomation(automation, [/メール|mail/i])) {
    return "メール確認の時間です。重要なメールをまとめますか？";
  }

  if (matchesAutomation(automation, [/sns|x\(|twitter|投稿/i])) {
    return "今日のSNS投稿を作成しますか？";
  }

  return `「${automation.name}」の時間です。今すぐ進めますか？`;
}

export function buildSnsActivityDropMessage(): string {
  return "最近SNS投稿が減っています。今日の投稿を作成しますか？";
}

export function buildProfileHabitMessage(
  label: string,
  profile: UserWorkProfile,
): string | null {
  const job = profile.frequentlyUsedJobs.find((item) => item.label === label);
  if (!job) return null;
  return `最近よく使う「${label}」です。今から進めますか？`;
}
