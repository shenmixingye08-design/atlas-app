import "server-only";

import type { Automation } from "@/lib/automations/types";
import {
  getEnabledStepIds,
  normalizeExecutionFlow,
} from "@/lib/automations/execution-flow";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";

import { resolveFeatureContextForUser } from "./drive-backup";
import { postTweetAutoForUser, scheduleTweetForUser } from "./service";

/** Post or schedule X content after an SNS automation run completes. */
export async function maybeAutoPostToXAfterAutomation(input: {
  userId: string | null | undefined;
  automation: Automation;
  content: string;
  context?: FeatureAccessContext;
}): Promise<void> {
  if (!input.userId) return;

  const text = input.content.trim();
  if (!text) return;

  const flow = normalizeExecutionFlow(input.automation.executionFlow);
  if (flow.templateId !== "sns_post") return;

  const enabledStepIds = getEnabledStepIds(flow);
  const publishEnabled = enabledStepIds.includes("publish");
  const scheduleEnabled = enabledStepIds.includes("schedule_post");

  if (!publishEnabled && !scheduleEnabled) return;

  const context =
    input.context ?? (await resolveFeatureContextForUser(input.userId));

  if (publishEnabled) {
    await postTweetAutoForUser({
      userId: input.userId,
      text,
      context,
      automationId: input.automation.id,
    });
    return;
  }

  if (scheduleEnabled && input.automation.nextRun) {
    await scheduleTweetForUser({
      userId: input.userId,
      text,
      scheduledFor: input.automation.nextRun,
      context,
      automationId: input.automation.id,
    });
  }
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
