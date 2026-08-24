function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#@]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 4000);
}

function trigrams(text: string): Set<string> {
  const n = normalize(text);
  const grams = new Set<string>();
  if (n.length < 3) {
    if (n) grams.add(n);
    return grams;
  }
  for (let i = 0; i < n.length - 2; i += 1) {
    grams.add(n.slice(i, i + 3));
  }
  return grams;
}

export function jaccardSimilarity(a: string, b: string): number {
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 && right.size === 0) return 1;
  let inter = 0;
  for (const gram of left) {
    if (right.has(gram)) inter += 1;
  }
  const union = left.size + right.size - inter;
  return union === 0 ? 0 : inter / union;
}

export const DUPLICATE_THRESHOLD = 0.62;

export function isDuplicateOfAny(candidate: string, existing: string[]): boolean {
  return existing.some((row) => jaccardSimilarity(candidate, row) >= DUPLICATE_THRESHOLD);
}
