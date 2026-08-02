import { getRecommendedAutomations } from "@/lib/onboarding/recommendations";
import { loadUserWorkProfile } from "@/lib/user-profile/store";

import { resolveQuickWin } from "./quick-win";
import { loadRetentionState } from "./store";
import type { HomeBootstrapItem } from "./types";

/**
 * Non-empty first home: recommended work / deliverables / popular automations.
 * Pure composition — no Planner/Deliverable core changes.
 */
export function buildHomeBootstrapItems(): HomeBootstrapItem[] {
  const retention = loadRetentionState();
  const profile = loadUserWorkProfile();
  const quickWin = resolveQuickWin({
    roleId: retention.wizard.roleId,
    preferredTasks: retention.wizard.preferredTasks,
  });

  const items: HomeBootstrapItem[] = [
    {
      id: "recommended-work",
      kind: "recommended_work",
      title: "おすすめの仕事",
      description:
        retention.wizard.workDescription.trim() ||
        `${quickWin.title}から始めると、今日中に仕事が終わります。`,
      href: quickWin.href,
      ctaLabel: "今すぐ任せる",
    },
    {
      id: "quick-deliverable",
      kind: "quick_deliverable",
      title: "今すぐ作れる成果物",
      description: `${quickWin.deliverableLabel} — 外部連携なしで受け取れます。`,
      href: quickWin.href,
      ctaLabel: "成果物を作る",
    },
  ];

  const popular = getRecommendedAutomations(profile).slice(0, 2);
  if (popular.length === 0) {
    items.push({
      id: "popular-weekly-report",
      kind: "popular_automation",
      title: "人気Automation",
      description: "毎週の営業レポート自動作成（最も早く価値が出る導線）",
      href: "/activation/weekly-report",
      ctaLabel: "始める",
    });
  } else {
    for (const auto of popular) {
      items.push({
        id: `popular-${auto.id}`,
        kind: "popular_automation",
        title: "人気Automation",
        description: `${auto.label} — ${auto.description}`,
        href: auto.href,
        ctaLabel: "設定する",
      });
    }
  }

  return items;
}
