/** 収益エージェントβのキャンペーン ID。推測のキャンペーン名は使わない。 */
export const REVENUE_AGENT_CAMPAIGN_ID = "minervot_owner_growth";

/** utm_campaign と campaignId の初期値。 */
export const REVENUE_AGENT_CAMPAIGN = REVENUE_AGENT_CAMPAIGN_ID;

export const REVENUE_UTM_SOURCE_X = "x";
export const REVENUE_UTM_MEDIUM_SOCIAL = "social";

/** リポジトリ内に実在する無料登録 / LP 導線だけを許可する。 */
export const ALLOWED_GROWTH_PATHS = [
  "/",
  "/sign-up",
  "/tools/automation-diagnosis",
  "/use-cases/first-offer",
] as const;
export type AllowedGrowthPath = (typeof ALLOWED_GROWTH_PATHS)[number];

export const DEFAULT_GROWTH_PATH: AllowedGrowthPath = "/sign-up";

export const ATTRIBUTION_WINDOW_DAYS = 30;
export const ATTRIBUTION_WINDOW_MS = ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Clerk 登録完了とみなす上限。再ログインを新規登録にしない。 */
export const SIGNUP_CREATED_WITHIN_MS = 48 * 60 * 60 * 1000;

export const GROWTH_VISITOR_COOKIE = "mv_vid";

export const MIN_LEARNING_PUBLISHED = 3;
export const MIN_CLICKS_FOR_STOP = 20;
