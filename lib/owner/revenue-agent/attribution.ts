import { randomUUID } from "node:crypto";

import {
  ATTRIBUTION_WINDOW_MS,
  REVENUE_AGENT_CAMPAIGN_ID,
  SIGNUP_CREATED_WITHIN_MS,
} from "./constants";
import {
  clickDedupeKey,
  firstAutomationDedupeKey,
  firstJobDedupeKey,
  signupDedupeKey,
  type RevenueAgentEvent,
} from "./events";

export type RevenueTouch = {
  campaignId: string | null;
  contentId: string | null;
  source: string | null;
  medium: string | null;
  at: string;
};

export type RevenueVisitor = {
  visitorId: string;
  firstTouch: RevenueTouch | null;
  lastTouch: RevenueTouch | null;
  createdAt: string;
  updatedAt: string;
};

export type VisitorUserLink = {
  visitorId: string;
  userId: string;
  linkedAt: string;
  attributedCampaignId: string | null;
  attributedContentId: string | null;
  source: string | null;
  medium: string | null;
  firstTouchAt: string | null;
  lastTouchAt: string | null;
};

export function createVisitorId(): string {
  return `vid_${randomUUID()}`;
}

export function isWithinAttributionWindow(
  touchAt: string | null | undefined,
  now = new Date(),
): boolean {
  if (!touchAt) return false;
  const ms = Date.parse(touchAt);
  if (Number.isNaN(ms)) return false;
  return now.getTime() - ms <= ATTRIBUTION_WINDOW_MS;
}

export function isRecentClerkSignup(
  createdAtMs: number | null | undefined,
  now = new Date(),
): boolean {
  if (createdAtMs == null || !Number.isFinite(createdAtMs)) return false;
  return now.getTime() - createdAtMs <= SIGNUP_CREATED_WITHIN_MS;
}

export function applyVisitTouch(
  visitor: RevenueVisitor | null,
  touch: RevenueTouch,
  nowIso = new Date().toISOString(),
): RevenueVisitor {
  if (!visitor) {
    return {
      visitorId: createVisitorId(),
      firstTouch: touch,
      lastTouch: touch,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }
  return {
    ...visitor,
    firstTouch: visitor.firstTouch ?? touch,
    lastTouch: touch,
    updatedAt: nowIso,
  };
}

export function touchFromParams(input: {
  campaignId?: string | null;
  contentId?: string | null;
  source?: string | null;
  medium?: string | null;
  at?: string;
}): RevenueTouch {
  return {
    campaignId: input.campaignId ?? REVENUE_AGENT_CAMPAIGN_ID,
    contentId: input.contentId ?? null,
    source: input.source ?? "x",
    medium: input.medium ?? "social",
    at: input.at ?? new Date().toISOString(),
  };
}

/**
 * 特定投稿へ帰属できる last touch だけを返す。
 * UTM / contentId が無い通常流入は null。
 */
export function attributedLastTouch(
  visitor: RevenueVisitor | null,
  now = new Date(),
): RevenueTouch | null {
  const touch = visitor?.lastTouch ?? null;
  if (!touch?.contentId) return null;
  if (!isWithinAttributionWindow(touch.at, now)) return null;
  return touch;
}

export function buildVisitorUserLink(input: {
  visitor: RevenueVisitor;
  userId: string;
  now?: Date;
}): VisitorUserLink {
  const now = input.now ?? new Date();
  const touch = attributedLastTouch(input.visitor, now);
  return {
    visitorId: input.visitor.visitorId,
    userId: input.userId,
    linkedAt: now.toISOString(),
    attributedCampaignId: touch?.campaignId ?? null,
    attributedContentId: touch?.contentId ?? null,
    source: touch?.source ?? null,
    medium: touch?.medium ?? null,
    firstTouchAt: input.visitor.firstTouch?.at ?? null,
    lastTouchAt: input.visitor.lastTouch?.at ?? null,
  };
}

export function findLinkForUser(
  links: VisitorUserLink[],
  userId: string,
): VisitorUserLink | null {
  return links.find((row) => row.userId === userId) ?? null;
}

export function canCountSignup(input: {
  userId: string;
  clerkCreatedAtMs: number | null | undefined;
  existingEvents: RevenueAgentEvent[];
  link: VisitorUserLink | null;
  now?: Date;
}): { ok: true; contentId: string } | { ok: false; reason: string } {
  const now = input.now ?? new Date();
  if (input.existingEvents.some((event) => event.dedupeKey === signupDedupeKey(input.userId))) {
    return { ok: false, reason: "already_counted" };
  }
  if (!isRecentClerkSignup(input.clerkCreatedAtMs, now)) {
    return { ok: false, reason: "not_new_signup" };
  }
  if (!input.link?.attributedContentId) {
    return { ok: false, reason: "organic_unattributed" };
  }
  if (!isWithinAttributionWindow(input.link.lastTouchAt, now)) {
    return { ok: false, reason: "window_expired" };
  }
  return { ok: true, contentId: input.link.attributedContentId };
}

export function userAlreadyHasEvent(
  events: RevenueAgentEvent[],
  dedupeKey: string,
): boolean {
  return events.some((event) => event.dedupeKey === dedupeKey);
}

export function attributedContentForUser(
  links: VisitorUserLink[],
  userId: string,
  now = new Date(),
): VisitorUserLink | null {
  const link = findLinkForUser(links, userId);
  if (!link?.attributedContentId) return null;
  if (!isWithinAttributionWindow(link.lastTouchAt, now)) return null;
  return link;
}

export {
  clickDedupeKey,
  firstAutomationDedupeKey,
  firstJobDedupeKey,
  signupDedupeKey,
};
