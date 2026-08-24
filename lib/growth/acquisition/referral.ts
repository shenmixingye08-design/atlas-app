import { randomUUID } from "node:crypto";

import { ACQUISITION_CAMPAIGN_ID, DIAGNOSIS_PATH, REFERRAL_REWARD_LABEL } from "./constants";
import { getReferral, listReferrals, saveReferral } from "./store";
import type { ReferralRecord } from "./types";

export function createReferralLink(userId: string): ReferralRecord {
  const existing = listReferrals().find((row) => row.userId === userId);
  if (existing) return existing;
  const referralId = `rf_${randomUUID().slice(0, 10)}`;
  const contentId = `ac_ref_${referralId}`;
  return saveReferral({
    referralId,
    userId,
    campaignId: ACQUISITION_CAMPAIGN_ID,
    contentId,
    createdAt: new Date().toISOString(),
    claimedUserIds: [],
  });
}

export function referralLandingPath(record: ReferralRecord): string {
  const params = new URLSearchParams({
    utm_source: "referral",
    utm_medium: "referral",
    utm_campaign: record.campaignId,
    utm_content: record.contentId,
    campaignId: record.campaignId,
    contentId: record.contentId,
    referralId: record.referralId,
  });
  return `${DIAGNOSIS_PATH}?${params.toString()}`;
}

export function detectReferralAbuse(input: {
  referralId: string;
  visitorUserId?: string | null;
  existingUserIds?: string[];
}): { ok: boolean; reason?: string } {
  const record = getReferral(input.referralId);
  if (!record) return { ok: false, reason: "unknown_referral" };
  if (input.visitorUserId && input.visitorUserId === record.userId) {
    return { ok: false, reason: "self_referral" };
  }
  if (input.visitorUserId && record.claimedUserIds.includes(input.visitorUserId)) {
    return { ok: false, reason: "duplicate_registration" };
  }
  if (input.existingUserIds?.includes(record.userId) && input.visitorUserId === record.userId) {
    return { ok: false, reason: "loop" };
  }
  return { ok: true };
}

export function claimReferral(referralId: string, visitorUserId: string): { ok: boolean; reason?: string } {
  const check = detectReferralAbuse({ referralId, visitorUserId });
  if (!check.ok) return check;
  const record = getReferral(referralId);
  if (!record) return { ok: false, reason: "unknown_referral" };
  saveReferral({
    ...record,
    claimedUserIds: [...record.claimedUserIds, visitorUserId],
  });
  return { ok: true };
}

export function referralRewardLabel(): string {
  return REFERRAL_REWARD_LABEL;
}

export function listReferralRecords(): ReferralRecord[] {
  return listReferrals();
}
