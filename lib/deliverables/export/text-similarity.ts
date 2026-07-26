/** Normalize for Japanese deliverable content comparison. */
export function normalizeDeliverableText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\|?\s*:?-{3,}:?\s*\|.*$/gm, "")
    .replace(/\|/g, "")
    .replace(/^[-*•]\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .replace(/[／/]/g, "")
    .replace(/[・･]/g, "")
    .replace(/[：:]/g, "")
    .replace(/[〜~]/g, "")
    .replace(/[＋+]/g, "")
    .replace(/[（）()「」『』【】\[\]]/g, "")
    .replace(/[。、．，,.！？!?]/g, "")
    .replace(/[-—–_*=#>`]/g, "")
    .replace(/\s+/g, "")
    .trim()
}

/** Compact character count (whitespace removed). */
export function compactLength(input: string): number {
  return input.replace(/\s+/g, "").length
}

/**
 * Ordered character recall via LCS length / source length.
 * Used for PDF extraction rate and cross-format match rate.
 */
export function orderedCharRecall(source: string, target: string): number {
  const a = normalizeDeliverableText(source)
  const b = normalizeDeliverableText(target)
  if (a.length === 0) return 1
  if (b.length === 0) return 0

  // Rolling LCS for long strings (memory O(min(n,m)))
  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  // We need LCS(a,b) specifically with recall = LCS/|a|
  const n = a.length
  const m = b.length
  let prev = new Uint16Array(m + 1)
  let curr = new Uint16Array(m + 1)
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      if (a[i - 1] === b[j - 1]) curr[j] = prev[j - 1]! + 1
      else curr[j] = Math.max(prev[j]!, curr[j - 1]!)
    }
    const tmp = prev
    prev = curr
    curr = tmp
    curr.fill(0)
  }
  const lcs = prev[m]!
  void short
  void long
  return lcs / n
}

/** Symmetric match rate = min(recall(a→b), recall(b→a)). */
export function contentMatchRate(a: string, b: string): number {
  const r1 = orderedCharRecall(a, b)
  const r2 = orderedCharRecall(b, a)
  return Math.min(r1, r2)
}
