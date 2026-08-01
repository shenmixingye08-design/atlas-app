/**
 * βテスター操作が本番一般ユーザーと混線しにくいようにするための印。
 * Durable の完全分離は Supabase プロジェクト分離が理想。ここではアプリ層の印と課金セーフティ。
 */

export const BETA_ISOLATION = {
  /** Clerk/env でβと判定されたユーザーの成果物メタに付与 */
  metadataFlag: "atlasBetaTester",
  /** イベント meta */
  eventFlag: "beta",
  /** 無料枠強制（課金未発生）— Stripe Customer を作らない運用を推奨 */
  forceFreePlan: true,
} as const;

export function isBetaIsolationEnabled(): boolean {
  return process.env.ATLAS_BETA_ISOLATION !== "0";
}

export function stampBetaMetadata(
  metadata: Record<string, unknown> | null | undefined,
  isBeta: boolean
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) };
  if (isBeta && isBetaIsolationEnabled()) {
    base[BETA_ISOLATION.metadataFlag] = true;
    base.betaCohort =
      process.env.ATLAS_BETA_COHORT?.trim() || "phase6";
  }
  return base;
}
