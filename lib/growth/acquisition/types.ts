import type { FirstUsecaseId, PainChoice } from "@/lib/growth/revenue-max/types";
import type { PlanId } from "@/lib/billing/plans/types";

import type { AcquisitionChannel } from "./constants";

export const DIAGNOSIS_EVENT_NAMES = [
  "diagnosis_viewed",
  "diagnosis_started",
  "diagnosis_completed",
  "diagnosis_result_viewed",
  "diagnosis_signup_clicked",
  "diagnosis_signup_completed",
  "diagnosis_first_value_completed",
  "diagnosis_paid_conversion",
] as const;

export type DiagnosisEventName = (typeof DIAGNOSIS_EVENT_NAMES)[number];

export type RepeatWorkAnswer =
  | "sns"
  | "documents"
  | "schedule"
  | "admin"
  | "mixed";

export type ToolAnswer = "x" | "office" | "calendar" | "email" | "mixed";
export type FrequencyAnswer = "daily" | "weekly" | "monthly";
export type FirstCutAnswer = "sns" | "documents" | "schedule" | "admin";

export type DiagnosisAnswers = {
  repeatWork: RepeatWorkAnswer;
  heaviest: RepeatWorkAnswer;
  tool: ToolAnswer;
  frequency: FrequencyAnswer;
  firstCut: FirstCutAnswer;
};

export type DiagnosisArchetype =
  | "broadcast"
  | "documents"
  | "schedule"
  | "admin"
  | "mixed";

export type DiagnosisResult = {
  archetype: DiagnosisArchetype;
  label: string;
  burden: string;
  firstJob: FirstUsecaseId;
  pain: PainChoice;
  availableFeatures: string[];
  unavailable: string[];
  firstRequestExample: string;
  planNote: string;
};

export type DiagnosisSession = {
  sessionId: string;
  visitorId: string | null;
  userId: string | null;
  answers: DiagnosisAnswers | null;
  result: DiagnosisResult | null;
  campaignId: string | null;
  contentId: string | null;
  referralId: string | null;
  channel: AcquisitionChannel;
  startedAt: string | null;
  completedAt: string | null;
  signupClickedAt: string | null;
  boundUserId: string | null;
};

export type EvidenceStatus =
  | "unverified"
  | "verified_preview"
  | "verified_production"
  | "approved_for_marketing"
  | "rejected"
  | "expired";

export type EvidenceFact = {
  id: string;
  title: string;
  fact: string;
  status: EvidenceStatus;
  plans: PlanId[];
  limitLabel: string | null;
  screenHref: string | null;
  measuredCount: number | null;
  userStoryAllowed: boolean;
  prohibited: string[];
};

export type UseCasePageStatus = "draft" | "approved" | "rejected";

export type UseCaseSlug =
  | "x-posts"
  | "recurring-work"
  | "document-outlines"
  | "daily-tasks";

export type CampaignVerdict =
  | "draft"
  | "approved"
  | "running"
  | "insufficient_data"
  | "continue_candidate"
  | "improve_candidate"
  | "stop_candidate"
  | "stopped";

export type StoryConsent =
  | "ops_only"
  | "anonymous_ok"
  | "named_ok"
  | "do_not_publish";

export type ReferralRecord = {
  referralId: string;
  userId: string;
  campaignId: string;
  contentId: string;
  createdAt: string;
  claimedUserIds: string[];
};

export type PackItemStatus = "draft" | "approved" | "rejected";

export type PublishedPackItem = {
  contentId: string;
  postUrl: string;
  publishedAt: string;
};

export type AcquisitionEvent = {
  eventId: string;
  eventName: DiagnosisEventName;
  occurredAt: string;
  visitorId: string | null;
  userId: string | null;
  campaignId: string | null;
  contentId: string | null;
  channel: AcquisitionChannel;
  dedupeKey: string;
};
