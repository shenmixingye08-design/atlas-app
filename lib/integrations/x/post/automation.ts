import "server-only";

import type { Automation } from "@/lib/automations/types";
import {
  getEnabledStepIds,
  normalizeExecutionFlow,
} from "@/lib/automations/execution-flow";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";

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
