import "server-only";

import type { Automation } from "@/lib/automations/types";
import {
  getEnabledStepIds,
  normalizeExecutionFlow,
} from "@/lib/automations/execution-flow";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import type { Deliverable } from "@/lib/orchestration/deliverable-types";
import { getSocialPostCards } from "@/lib/orchestration/deliverable-display";

import { resolveFeatureContextForUser } from "./drive-backup";
import { postTweetAutoForUser, scheduleTweetForUser } from "./service";
import type { XPostResult } from "./types";

/**
 * Result of an SNS auto-post attempt after an automation run.
 * `attempted: false` means this automation was not an SNS publish/schedule
 * flow (nothing to post). When `attempted: true`, `result.status` reflects
 * whether the tweet actually reached X so callers can avoid reporting a
 * false "投稿完了".
 */
export type MaybeAutoPostResult =
  | { attempted: false }
  | { attempted: true; mode: "publish" | "schedule"; result: XPostResult };

/** Post or schedule X content after an SNS automation run completes. */
export async function maybeAutoPostToXAfterAutomation(input: {
  userId: string | null | undefined;
  automation: Automation;
  content: string;
  context?: FeatureAccessContext;
}): Promise<MaybeAutoPostResult> {
  if (!input.userId) return { attempted: false };

  const text = input.content.trim();
  if (!text) return { attempted: false };

  const flow = normalizeExecutionFlow(input.automation.executionFlow);
  if (flow.templateId !== "sns_post") return { attempted: false };

  const enabledStepIds = getEnabledStepIds(flow);
  const publishEnabled = enabledStepIds.includes("publish");
  const scheduleEnabled = enabledStepIds.includes("schedule_post");

  if (!publishEnabled && !scheduleEnabled) return { attempted: false };

  const context =
    input.context ?? (await resolveFeatureContextForUser(input.userId));

  if (publishEnabled) {
    const result = await postTweetAutoForUser({
      userId: input.userId,
      text,
      context,
      automationId: input.automation.id,
    });
    return { attempted: true, mode: "publish", result };
  }

  if (scheduleEnabled && input.automation.nextRun) {
    const result = await scheduleTweetForUser({
      userId: input.userId,
      text,
      scheduledFor: input.automation.nextRun,
      context,
      automationId: input.automation.id,
    });
    return { attempted: true, mode: "schedule", result };
  }

  return { attempted: false };
}

/**
 * Best tweet text for a completed SNS deliverable. Prefers the clean post
 * card(s) shown to the user, then the structured `snsPost` field, and finally
 * the raw final response. This is what actually reaches X.
 */
export function resolveTweetTextForPublish(input: {
  deliverable?: Deliverable | null;
  finalResponse?: string | null;
}): string {
  if (input.deliverable) {
    try {
      const cards = getSocialPostCards(input.deliverable);
      const firstCard = cards.find((card) => card.trim());
      if (firstCard) return firstCard.trim();
    } catch {
      // Fall through to metadata / final response below.
    }
    const snsPost = input.deliverable.metadata?.snsPost?.trim();
    if (snsPost) return snsPost;
  }
  return (input.finalResponse ?? "").trim();
}

/** True when the request text asks to actually publish (not just draft copy). */
export function hasXPublishIntent(assignment: string): boolean {
  const text = assignment.toLowerCase();
  const publish =
    /投稿|ポスト|つぶや|ツイート|tweet|post/.test(text) &&
    /投稿|ポスト|つぶや|ツイート|tweet|post|して|する|上げ|公開/.test(assignment);
  const draftOnly =
    /下書き|ドラフト|草案|文面だけ|文面のみ|作成だけ|作成のみ|準備だけ|保存だけ|案を(作|考)/.test(
      assignment,
    );
  return publish && !draftOnly;
}

/**
 * Publish an SNS deliverable to X after a one-off Commander run completes.
 * Unlike {@link maybeAutoPostToXAfterAutomation}, this path has no saved
 * execution flow — publish intent is inferred from the request text. Returns
 * `attempted: false` for non-SNS work or copy-only ("下書き") requests.
 */
export async function maybeAutoPostToXAfterCommander(input: {
  userId: string | null | undefined;
  templateId: string;
  assignment: string;
  deliverable?: Deliverable | null;
  finalResponse?: string | null;
  context?: FeatureAccessContext;
}): Promise<MaybeAutoPostResult> {
  if (!input.userId) return { attempted: false };
  if (input.templateId !== "sns_post") return { attempted: false };
  if (!hasXPublishIntent(input.assignment)) return { attempted: false };

  const text = resolveTweetTextForPublish({
    deliverable: input.deliverable,
    finalResponse: input.finalResponse,
  });
  if (!text) return { attempted: false };

  const context =
    input.context ?? (await resolveFeatureContextForUser(input.userId));

  const result = await postTweetAutoForUser({
    userId: input.userId,
    text,
    context,
  });

  return { attempted: true, mode: "publish", result };
}

export async function processScheduledXPostsFromAutomationTick(): Promise<
  Array<{ scheduledId: string; status: string }>
> {
  const { processDueScheduledXPosts } = await import("./service");

  const processed = await processDueScheduledXPosts({
    resolveContext: resolveFeatureContextForUser,
  });

  return processed.map((item) => ({
    scheduledId: item.scheduledId,
    status: item.result.status,
  }));
}

/**
 * Run the AI auto-post ("秘書おまかせ投稿") scheduled job from the cron tick.
 * Selects users with auto-post enabled and processes their due slots. The whole
 * schedule/idempotency layer is normal code; AI is used only for the copy.
 */
export async function processDueAutoPostsFromAutomationTick(): Promise<
  Array<{ userId: string; posted: number; drafted: number; skipped: number; failed: number }>
> {
  const { processDueAutoPosts } = await import("./autopost-runner");

  const outcomes = await processDueAutoPosts({
    resolveContext: resolveFeatureContextForUser,
  });

  return outcomes.map((outcome) => {
    const count = (status: string) =>
      outcome.slots.filter((slot) => slot.status === status).length;
    return {
      userId: outcome.userId,
      posted: count("posted"),
      drafted: count("drafted"),
      skipped: count("skipped"),
      failed: count("failed"),
    };
  });
}
