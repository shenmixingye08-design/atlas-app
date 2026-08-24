import type { RevenueMaxUserState } from "@/lib/growth/revenue-max/types";

import { addStory, listAllStoriesForOwner, listPublishableStories } from "./store";
import type { StoryConsent } from "./types";

export function canAskForStory(state: RevenueMaxUserState): boolean {
  if (!state.firstSuccessAt) return false;
  const successes = state.events.filter((event) => event.eventName === "first_request_succeeded").length;
  const valueTouches = state.lastValueAt && state.firstSuccessAt !== state.lastValueAt ? 1 : 0;
  return successes + valueTouches >= 3 && !state.lastFailMessage;
}

export function recordStory(input: {
  userId: string;
  usedFor: string;
  helpful: string;
  improve: string;
  consent: StoryConsent;
}): { ok: true } | { ok: false; error: string } {
  if (!input.usedFor || !input.helpful) {
    return { ok: false, error: "利用した作業と便利だった点を記入してください" };
  }
  addStory(input);
  return { ok: true };
}

export function publicStories() {
  return listPublishableStories();
}

export function ownerStories() {
  return listAllStoriesForOwner();
}

export function canUseStoryInMarketing(consent: string, published: boolean): boolean {
  return published && (consent === "anonymous_ok" || consent === "named_ok");
}
