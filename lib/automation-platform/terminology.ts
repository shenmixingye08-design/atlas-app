/**
 * Internal term: always `automation`.
 * User-facing labels are localized separately and must not leak into DB/API keys.
 */

export const INTERNAL_DOMAIN = "automation" as const;

/** Candidate user-facing names — UI rename is a later phase. */
export const USER_FACING_NAME_CANDIDATES = [
  {
    id: "automation",
    ja: "自動化",
    rationale: "最短で意図が伝わる。プラットフォーム名称としても自然。",
  },
  {
    id: "automated_work",
    ja: "自動化する仕事",
    rationale: "「仕事」を残しつつ自動化だと明示できる。",
  },
  {
    id: "auto_work",
    ja: "自動でやる仕事",
    rationale: "非エンジニアにも分かりやすい口語。",
  },
  {
    id: "repeating_work",
    ja: "繰り返す仕事",
    rationale: "既存「定期の仕事」に近いが自動化感が弱い。",
  },
  {
    id: "ai_entrusted_work",
    ja: "AIに任せる仕事",
    rationale: "秘書体験に合うが、スケジュール自動化の意味が弱い。",
  },
  {
    id: "scheduled_run",
    ja: "定期実行",
    rationale: "技術寄りで、承認や記憶を含む広い自動化を表しにくい。",
  },
] as const;

/** Recommended interim user-facing label while V1 UI remains. */
export const RECOMMENDED_USER_FACING_LABEL = {
  id: "automated_work",
  ja: "自動化する仕事",
  legacyJa: "定期の仕事",
} as const;

/** Legacy V1 storage / route identifiers kept for compatibility. */
export const LEGACY_V1_IDENTIFIERS = {
  userFacingLabelJa: "定期の仕事",
  durableDomain: "atlasAutomations",
  apiPrefix: "/api/automations",
  pagePath: "/automations",
} as const;
