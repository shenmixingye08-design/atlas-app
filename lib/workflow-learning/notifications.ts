import type {
  WorkflowLearningCandidate,
  WorkflowLearningSettings,
} from "@/lib/workflow-learning/types";

export type LearningNotificationItem = {
  candidateId: string;
  title: string;
  body: string;
  priority: "immediate" | "digest";
};

function effectScore(c: WorkflowLearningCandidate): number {
  const b = c.expectedBenefit;
  return (
    b.failureReduction * 3 +
    b.manualStepReduction * 2 +
    b.timeReduction +
    b.costReduction +
    c.confidence
  );
}

/**
 * Build notification plan — never spam.
 * High-effect candidates can be immediate; others go to weekly digest.
 */
export function planLearningNotifications(input: {
  candidates: WorkflowLearningCandidate[];
  settings: WorkflowLearningSettings;
}): LearningNotificationItem[] {
  if (input.settings.notifyDigest === "off") return [];

  const open = input.candidates.filter((c) => c.status === "candidate");
  const items: LearningNotificationItem[] = [];

  for (const c of open) {
    const score = effectScore(c);
    const high = score >= 2.2 || c.riskLevel === "high";
    if (input.settings.notifyDigest === "high_only" && !high) continue;
    if (input.settings.notifyDigest === "weekly" && !high) {
      items.push({
        candidateId: c.id,
        title: "改善候補のまとめ",
        body: c.summary,
        priority: "digest",
      });
      continue;
    }
    items.push({
      candidateId: c.id,
      title: high ? "効果の高い改善候補" : "改善候補",
      body: c.summary,
      priority: high ? "immediate" : "digest",
    });
  }

  // Dedupe by candidate
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.candidateId)) return false;
    seen.add(item.candidateId);
    return true;
  });
}
