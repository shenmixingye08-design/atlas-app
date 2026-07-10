import type { WorkflowCostSummary } from "@/lib/ai/cost-meter";
import { notifyOwnerApiBudgetExceeded } from "@/lib/notifications/emitters";

import { buildProviderSnapshot } from "./engine";
import { recordApiUsage } from "./store";

export function recordOpenAiUsageFromCostSummary(
  summary: WorkflowCostSummary,
  source: "orchestration" | "automation" = "orchestration",
): void {
  if (summary.estimatedCostUsd <= 0) return;

  recordApiUsage({
    providerId: "openai",
    amountUsd: summary.estimatedCostUsd,
    source,
  });

  const snapshot = buildProviderSnapshot("openai");
  if (snapshot.warningLevel === "critical") {
    notifyOwnerApiBudgetExceeded(
      `${snapshot.label}の今月使用量（$${snapshot.monthUsd.toFixed(2)}）が予算（$${snapshot.budgetUsd.toFixed(2)}）を超えました`,
    );
  }
}
