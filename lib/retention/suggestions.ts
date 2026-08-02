import type { Automation } from "@/lib/automations/types";
import { isActivationCompleted } from "@/lib/activation/store";
import { getOnboardingState } from "@/lib/onboarding/store";

import { loadRetentionState } from "./store";
import type { NextAutomateSuggestion } from "./types";

/**
 * Rule-based "次はこれを自動化できます" — no AI call.
 * Only unused / high-value next steps for the current cohort day.
 */
export function buildNextAutomateSuggestions(input?: {
  automations?: Automation[];
  now?: Date;
}): NextAutomateSuggestion[] {
  const state = loadRetentionState();
  const onboarding = getOnboardingState();
  const automations = input?.automations ?? [];
  const hasAutomation = automations.length > 0;
  const activationDone = isActivationCompleted();
  const suggestions: NextAutomateSuggestion[] = [];

  if (!activationDone) {
    suggestions.push({
      id: "first_deliverable",
      title: "最初の成果物を今すぐ作る",
      reason: "登録15分以内の成功体験がまだありません。",
      href: "/activation/weekly-report",
      priority: 100,
    });
  }

  if (activationDone && !hasAutomation) {
    suggestions.push({
      id: "create_automation",
      title: "同じ仕事を自動化する",
      reason: "初回成果物を、毎週自動で終わらせられます。",
      href: "/automations/new",
      priority: 90,
    });
  }

  if (!state.survey && activationDone) {
    suggestions.push({
      id: "feedback_loop",
      title: "5秒アンケートで好みを覚える",
      reason: "修正量と再利用意向をMemoryへ反映します。",
      href: "/projects?survey=1",
      priority: 80,
    });
  }

  const day2 = state.dayPlan.find((d) => d.day === 2);
  if (activationDone && !day2?.completedAt) {
    suggestions.push({
      id: "memory_setup",
      title: "Memoryに好みを登録する",
      reason: "毎回の説明を減らし、専属感を早めます。",
      href: "/settings/memory",
      priority: 70,
    });
  }

  const wanted = new Set(state.wizard.integrations);
  if (wanted.has("x") || onboarding.preferredTasks.includes("sns")) {
    suggestions.push({
      id: "x_automation",
      title: "X投稿を自動化する",
      reason: "SNS担当の繰り返し投稿を削減できます。",
      href: "/workspace/x",
      priority: 60,
    });
  }

  if (wanted.has("google") || wanted.has("email") || wanted.has("calendar")) {
    suggestions.push({
      id: "google_connect",
      title: "Google連携を完了する",
      reason: "メール・カレンダー・Drive保存まで一気通貫になります。",
      href: "/settings/google/drive",
      priority: 55,
    });
  }

  if (hasAutomation) {
    suggestions.push({
      id: "schedule_confirm",
      title: "定期実行の時刻を確定する",
      reason: "決めた時刻に仕事が終わる状態が継続率を押し上げます。",
      href: "/automations",
      priority: 50,
    });
  }

  // Deduplicate by id, keep highest priority, top 3 only (no spam).
  const byId = new Map<string, NextAutomateSuggestion>();
  for (const item of suggestions) {
    const prev = byId.get(item.id);
    if (!prev || prev.priority < item.priority) byId.set(item.id, item);
  }

  return [...byId.values()].sort((a, b) => b.priority - a.priority).slice(0, 3);
}
