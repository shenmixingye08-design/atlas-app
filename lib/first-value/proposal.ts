/**
 * AI提案は1件だけ。大量提案禁止。
 * Does not modify Proactive Suggestions core — UI/policy wrapper only.
 */

export type FirstValueProposal = {
  id: string;
  title: string;
  reason: string;
  href: string;
};

export type ProposalSourceJob = {
  id: string;
  title: string;
  completedCount?: number;
  lastCompletedAt?: string | null;
};

/**
 * Pick at most one next automation candidate from recent completed work.
 */
export function selectSingleAiProposal(
  recentJobs: ProposalSourceJob[],
): FirstValueProposal | null {
  if (recentJobs.length === 0) return null;
  const ranked = [...recentJobs].sort((a, b) => {
    const ac = a.completedCount ?? 0;
    const bc = b.completedCount ?? 0;
    if (bc !== ac) return bc - ac;
    const at = a.lastCompletedAt ? Date.parse(a.lastCompletedAt) : 0;
    const bt = b.lastCompletedAt ? Date.parse(b.lastCompletedAt) : 0;
    return bt - at;
  });
  const top = ranked[0]!;
  return {
    id: `propose:${top.id}`,
    title: `「${top.title}」を次回から自動化`,
    reason: "利用履歴から、次に任せられそうな仕事です",
    href: `/automations/quick-start?seed=${encodeURIComponent(top.title)}`,
  };
}

/** Hard cap for any proposal list shown on first-value surfaces. */
export function takeSingleProposal<T>(items: T[]): T | null {
  return items[0] ?? null;
}
