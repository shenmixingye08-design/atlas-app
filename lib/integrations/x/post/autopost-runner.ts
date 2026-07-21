import "server-only";

import { evaluateBillingFeature, evaluateBillingSnsPost } from "@/lib/billing/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { notifyXAutoPostDrafted, notifyXPostFailed } from "@/lib/notifications/emitters";

import {
  generateAutoPostText,
  isTooSimilar,
  selectPostType,
} from "./autopost-generator";
import { computeDueSlots } from "./autopost-schedule";
import {
  listEnabledXAutoPostSettings,
  loadXAutoPostSettings,
} from "./autopost-settings-store";
import {
  claimXAutoPostSlot,
  listXAutoPostRuns,
  updateXAutoPostRun,
} from "./autopost-runs-store";
import type { XAutoPostRunStatus, XAutoPostSettings } from "./autopost-types";
import { postTweetAutoForUser, saveXDraftForUser } from "./service";
import { validateTweetText } from "./validate";

export type AutoPostSlotOutcome = {
  slotKey: string;
  status: XAutoPostRunStatus;
  reason?: string;
  text?: string;
};

export type AutoPostUserOutcome = {
  userId: string;
  slots: AutoPostSlotOutcome[];
};

async function processSlotForUser(input: {
  settings: XAutoPostSettings;
  context: FeatureAccessContext;
  slotKey: string;
  scheduledFor: string;
  seed: number;
  recentTexts: string[];
}): Promise<AutoPostSlotOutcome> {
  const { settings, context, slotKey, scheduledFor } = input;
  const userId = settings.userId;

  // Idempotency: claim the slot first. A second (retried / overlapping) tick
  // gets claimed=false and does nothing — no double posts, no double AI spend.
  const claim = await claimXAutoPostSlot({
    userId,
    slotKey,
    scheduledFor,
    mode: settings.mode,
  });
  if (!claim.claimed) {
    return { slotKey, status: "skipped", reason: "already_claimed" };
  }
  const runId = claim.run.id;

  // Cost guard BEFORE any AI call: skip when the plan cannot auto-post.
  const featureDenial = (await evaluateBillingFeature(userId, "sns_auto_post"))
    .denial;
  const limitDenial = (await evaluateBillingSnsPost(userId)).denial;
  if (featureDenial || limitDenial) {
    await updateXAutoPostRun(runId, {
      status: "skipped",
      errorMessage: featureDenial ? "プラン制限" : "投稿上限",
    });
    return { slotKey, status: "skipped", reason: "billing" };
  }

  const postType = selectPostType(input.seed);
  const generated = await generateAutoPostText({
    settings,
    postType,
    recentTexts: input.recentTexts,
    slotKey,
  });

  // Skip near-duplicate content instead of regenerating (cost rule: no
  // re-generate of the same post).
  if (isTooSimilar(generated.text, input.recentTexts)) {
    await updateXAutoPostRun(runId, {
      status: "skipped",
      postType,
      text: generated.text,
      errorMessage: "類似投稿のためスキップ",
    });
    return { slotKey, status: "skipped", reason: "duplicate" };
  }

  const validation = validateTweetText(generated.text);
  if (validation.errors.length > 0) {
    await updateXAutoPostRun(runId, {
      status: "failed",
      postType,
      text: generated.text,
      errorMessage: validation.errors.join(" / "),
    });
    return { slotKey, status: "failed", reason: "validation" };
  }

  // Approval mode: save a draft + notify. Never posts automatically.
  if (settings.mode === "approval") {
    const draftResult = await saveXDraftForUser({
      userId,
      text: generated.text,
      context,
    });
    if (draftResult.status !== "ready") {
      await updateXAutoPostRun(runId, {
        status: "failed",
        postType,
        text: generated.text,
        errorMessage:
          "message" in draftResult ? draftResult.message : "下書き保存に失敗",
      });
      return { slotKey, status: "failed", reason: "draft_failed" };
    }
    await updateXAutoPostRun(runId, {
      status: "drafted",
      postType,
      text: generated.text,
    });
    notifyXAutoPostDrafted(userId);
    return { slotKey, status: "drafted", text: generated.text };
  }

  // Full-auto mode: post via the existing createTweet path (handles hydration).
  const result = await postTweetAutoForUser({
    userId,
    text: generated.text,
    context,
  });

  if (result.status === "ready" && result.history?.status === "success") {
    await updateXAutoPostRun(runId, {
      status: "posted",
      postType,
      text: generated.text,
      tweetId: result.history.tweetId,
      tweetUrl: result.history.tweetUrl,
    });
    return { slotKey, status: "posted", text: generated.text };
  }

  const message =
    result.status === "ready"
      ? (result.history?.errorMessage ?? "投稿に失敗しました")
      : "message" in result
        ? result.message
        : "投稿に失敗しました";

  await updateXAutoPostRun(runId, {
    status: "failed",
    postType,
    text: generated.text,
    errorMessage: message,
  });

  // executeTweetPost notifies on X API errors; surface connection issues too.
  if (result.status === "x_not_connected" || result.status === "error") {
    notifyXPostFailed(userId, message);
  }

  return { slotKey, status: "failed", reason: result.status };
}

/** Run all due slots for a single user. */
export async function runDueAutoPostsForUser(input: {
  settings: XAutoPostSettings;
  context: FeatureAccessContext;
  now?: Date;
}): Promise<AutoPostUserOutcome> {
  const { settings, context } = input;
  const now = input.now ?? new Date();

  const dueSlots = computeDueSlots(settings, now);
  if (dueSlots.length === 0) {
    return { userId: settings.userId, slots: [] };
  }

  const recentRuns = await listXAutoPostRuns(settings.userId, 20);
  const recentTexts = recentRuns
    .filter(
      (run) =>
        (run.status === "posted" || run.status === "drafted") && run.text,
    )
    .map((run) => run.text!)
    .slice(0, 10);
  const baseSeed = recentRuns.length;

  const slots: AutoPostSlotOutcome[] = [];
  let index = 0;
  for (const slot of dueSlots) {
    const outcome = await processSlotForUser({
      settings,
      context,
      slotKey: slot.slotKey,
      scheduledFor: slot.scheduledFor,
      seed: baseSeed + index,
      recentTexts,
    });
    slots.push(outcome);

    // Feed just-created content back so multiple due slots in one tick vary.
    if (outcome.text) {
      recentTexts.unshift(outcome.text);
    }
    index += 1;
  }

  return { userId: settings.userId, slots };
}

/**
 * Entry point for the scheduled job. Selects every user with auto-post enabled
 * and processes their due slots. Safe to call repeatedly (idempotent per slot).
 */
export async function processDueAutoPosts(input: {
  resolveContext: (userId: string) => Promise<FeatureAccessContext>;
  now?: Date;
}): Promise<AutoPostUserOutcome[]> {
  const enabled = await listEnabledXAutoPostSettings();
  const outcomes: AutoPostUserOutcome[] = [];

  for (const settings of enabled) {
    try {
      const context = await input.resolveContext(settings.userId);
      const outcome = await runDueAutoPostsForUser({
        settings,
        context,
        now: input.now,
      });
      if (outcome.slots.length > 0) outcomes.push(outcome);
    } catch (error) {
      console.warn("[X AutoPost] user run failed:", settings.userId);
      if (error instanceof Error) {
        console.warn("[X AutoPost] run detail:", error.message);
      }
    }
  }

  return outcomes;
}

/** Convenience for a single user (used by the settings API for load). */
export async function loadUserAutoPostSettings(
  userId: string,
): Promise<XAutoPostSettings> {
  return loadXAutoPostSettings(userId);
}
