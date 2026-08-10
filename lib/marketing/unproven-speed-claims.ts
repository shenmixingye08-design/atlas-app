/**
 * N-02: Unproven job-completion speed guarantees must not appear in
 * user-facing copy. Production has no measured AI orchestrate SLA that
 * supports "完了 in 60 seconds" (or equivalent) claims.
 */

export const FORBIDDEN_UNPROVEN_SPEED_CLAIM_PATTERNS = [
  /60\s*秒/,
  /６０\s*秒/,
  /60\s*seconds?/i,
  /\bone\s*minute\b/i,
  /within\s*60/i,
  /within\s*one\s*minute/i,
  /秒以内に\s*1\s*件/,
  /秒で\s*1\s*件\s*完成/,
  /1\s*分以内/,
  /１\s*分以内/,
  /1\s*分で\s*(完成|1件|終わ)/,
  /分以内に\s*1\s*件/,
  /業界最速/,
  /瞬時に/,
  /数秒で\s*(完成|1件|終わ)/,
  /必ず\s*\d+\s*(秒|分)\s*以内/,
  /数分で開始/,
  /sixtySecondWin/,
] as const;

/** Source surfaces that ship to LP / pricing / metadata / post-login UX. */
export const SPEED_CLAIM_SCAN_RELATIVE_PATHS = [
  "lib/seo/site.ts",
  "lib/i18n/ja.ts",
  "lib/landing/demo-data.ts",
  "lib/landing/content.ts",
  "lib/landing/pay-reason.ts",
  "components/landing/landing-hero-section.tsx",
  "components/landing/landing-cta-section.tsx",
  "components/landing/landing-page.tsx",
  "components/onboarding/first-success-experience.tsx",
  "app/sign-up/[[...sign-up]]/page.tsx",
  "app/pricing/page.tsx",
  "app/page.tsx",
  "app/layout.tsx",
  "lib/legal/terms-content.ts",
  "lib/legal/privacy-content.ts",
] as const;

export type SpeedClaimHit = {
  pattern: string;
  excerpt: string;
};

export function findUnprovenSpeedClaims(text: string): SpeedClaimHit[] {
  const hits: SpeedClaimHit[] = [];
  for (const pattern of FORBIDDEN_UNPROVEN_SPEED_CLAIM_PATTERNS) {
    const match = text.match(pattern);
    if (!match || match.index == null) continue;
    const start = Math.max(0, match.index - 24);
    const end = Math.min(text.length, match.index + match[0].length + 24);
    hits.push({
      pattern: String(pattern),
      excerpt: text.slice(start, end).replace(/\s+/g, " ").trim(),
    });
  }
  return hits;
}

export function assertTextHasNoUnprovenSpeedClaims(
  label: string,
  text: string,
): { ok: true } | { ok: false; errors: string[] } {
  const hits = findUnprovenSpeedClaims(text);
  if (hits.length === 0) return { ok: true };
  return {
    ok: false,
    errors: hits.map(
      (hit) => `${label}: pattern ${hit.pattern} near "${hit.excerpt}"`,
    ),
  };
}
