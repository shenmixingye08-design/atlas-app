import type { CorrectionMetrics } from "@/lib/personal-memory/quality/types";

/**
 * Character-level LCS-inspired correction metrics (no LLM).
 * replaced ≈ min(deleted, added) along the edit path approximation.
 */
export function computeCorrectionMetrics(
  before: string,
  after: string,
): CorrectionMetrics {
  const a = before ?? "";
  const b = after ?? "";
  if (a === b) {
    return {
      deletedChars: 0,
      addedChars: 0,
      replacedChars: 0,
      diffRate: 0,
      beforeLength: a.length,
      afterLength: b.length,
    };
  }

  // For long texts, sample windows to keep O(n*m) bounded.
  const MAX = 2_000;
  const left = a.length > MAX ? a.slice(0, MAX) : a;
  const right = b.length > MAX ? b.slice(0, MAX) : b;
  const lcs = longestCommonSubsequenceLength(left, right);
  const deleted = Math.max(0, left.length - lcs);
  const added = Math.max(0, right.length - lcs);
  const replaced = Math.min(deleted, added);
  const denom = Math.max(left.length, 1);
  const rawRate = (deleted + added) / denom;
  // Scale if truncated
  const scale =
    a.length > MAX || b.length > MAX
      ? Math.max(a.length, b.length) / MAX
      : 1;
  const diffRate = Math.min(1, rawRate * Math.min(scale, 1.25));

  return {
    deletedChars: Math.round(deleted * (a.length > MAX ? a.length / MAX : 1)),
    addedChars: Math.round(added * (b.length > MAX ? b.length / MAX : 1)),
    replacedChars: Math.round(
      replaced * (Math.max(a.length, b.length) > MAX ? Math.max(a.length, b.length) / MAX : 1),
    ),
    diffRate: Number(diffRate.toFixed(4)),
    beforeLength: a.length,
    afterLength: b.length,
  };
}

function longestCommonSubsequenceLength(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return 0;
  // Two-row DP
  let prev = new Array<number>(m + 1).fill(0);
  let curr = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) curr[j] = prev[j - 1]! + 1;
      else curr[j] = Math.max(prev[j]!, curr[j - 1]!);
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[m]!;
}
