import { REVENUE_AGENT_CAMPAIGN_ID } from "@/lib/owner/revenue-agent/constants";

export const ACQUISITION_CAMPAIGN_ID = REVENUE_AGENT_CAMPAIGN_ID;
export const ACQUISITION_DOMAIN = "atlasAcquisition";
export const DIAGNOSIS_COOKIE = "mv_diag";
export const DIAGNOSIS_PATH = "/tools/automation-diagnosis";
export const REFERRAL_REWARD_LABEL = "未設定";

export const ACQUISITION_CHANNELS = [
  "x",
  "tiktok",
  "youtube_shorts",
  "youtube",
  "seo",
  "diagnosis",
  "referral",
  "direct",
  "unknown",
] as const;

export type AcquisitionChannel = (typeof ACQUISITION_CHANNELS)[number];
