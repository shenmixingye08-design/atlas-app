import type { RetentionDayId, RetentionDayStatus } from "./types";

export type RetentionDayDefinition = {
  day: RetentionDayId;
  title: string;
  summary: string;
  href: string;
  ctaLabel: string;
  /** Event keys that mark this day complete. */
  completeOn: readonly string[];
};

export const RETENTION_DAY_PLAN: readonly RetentionDayDefinition[] = [
  {
    day: 1,
    title: "初回成果物",
    summary: "15分以内に、最初の仕事を終わらせて成果物を受け取ります。",
    href: "/activation/weekly-report",
    ctaLabel: "成果物を作る",
    completeOn: ["first_artifact", "activation_completed"],
  },
  {
    day: 2,
    title: "Memory学習",
    summary: "好み・言い回し・確認方針を覚えさせ、毎回の説明を減らします。",
    href: "/settings/memory",
    ctaLabel: "Memoryを整える",
    completeOn: ["memory_touched", "survey_applied"],
  },
  {
    day: 3,
    title: "Automation",
    summary: "繰り返す仕事を自動化し、手動の依頼を減らします。",
    href: "/automations/new",
    ctaLabel: "自動化を追加",
    completeOn: ["automation_created"],
  },
  {
    day: 4,
    title: "外部連携",
    summary: "Google / Dropbox / X / メール / カレンダーを必要な分だけつなぎます。",
    href: "/settings",
    ctaLabel: "連携を確認",
    completeOn: ["integration_connected"],
  },
  {
    day: 5,
    title: "定期実行",
    summary: "毎日・毎週の実行時刻を確定し、自動で仕事が進む状態にします。",
    href: "/automations",
    ctaLabel: "定期実行を確認",
    completeOn: ["schedule_confirmed"],
  },
  {
    day: 6,
    title: "成果物改善",
    summary: "初回成果物を直し、Memoryへ反映して次から品質を上げます。",
    href: "/projects",
    ctaLabel: "成果物を見直す",
    completeOn: ["deliverable_improved"],
  },
  {
    day: 7,
    title: "AI秘書完成",
    summary: "7日分の習慣が揃いました。専属秘書として日常運用に入ります。",
    href: "/projects",
    ctaLabel: "ホームで確認",
    completeOn: ["day7_completed"],
  },
] as const;

export function getRetentionDayDefinition(
  day: RetentionDayId,
): RetentionDayDefinition {
  const found = RETENTION_DAY_PLAN.find((item) => item.day === day);
  if (!found) {
    throw new Error(`Unknown retention day: ${day}`);
  }
  return found;
}

export function resolveRetentionDayNumber(
  createdAtIso: string | null | undefined,
  now: Date = new Date(),
): RetentionDayId {
  if (!createdAtIso) return 1;
  const created = new Date(createdAtIso);
  if (Number.isNaN(created.getTime())) return 1;
  const start = Date.UTC(
    created.getUTCFullYear(),
    created.getUTCMonth(),
    created.getUTCDate(),
  );
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diff = Math.floor((today - start) / 86_400_000) + 1;
  if (diff <= 1) return 1;
  if (diff >= 7) return 7;
  return diff as RetentionDayId;
}

export function resolveDayStatus(input: {
  day: RetentionDayId;
  currentDay: RetentionDayId;
  completedAt: string | null;
}): RetentionDayStatus {
  if (input.completedAt) return "done";
  if (input.day === input.currentDay) return "current";
  if (input.day < input.currentDay) return "missed";
  return "locked";
}
