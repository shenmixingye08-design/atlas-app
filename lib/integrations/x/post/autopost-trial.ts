/**
 * Immediate first-run trial for dedicated X auto-post.
 * Uses the same generate → post/draft → history → notify path as the tick.
 * Does not claim a scheduled slot, so the next run stays intact.
 */

import "server-only";

import {
  evaluateBillingFeature,
  evaluateBillingSnsPost,
} from "@/lib/billing/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { notifyXAutoPostDrafted, notifyXPostFailed } from "@/lib/notifications/emitters";

import { applyMemoryToDedicatedAutoPost } from "./autopost-memory";
import { generateAutoPostText, selectPostType } from "./autopost-generator";
import {
  claimXAutoPostSlot,
  listXAutoPostRuns,
  updateXAutoPostRun,
} from "./autopost-runs-store";
import type { XAutoPostRun, XAutoPostSettings } from "./autopost-types";
import { postTweetAutoForUser, saveXDraftForUser } from "./service";
import { validateTweetText } from "./validate";

export type AutoPostTrialResult =
  | {
      status: "posted" | "drafted";
      text: string;
      run: XAutoPostRun;
      memoryApplied: boolean;
      memoryFailed: boolean;
      alreadyDone: boolean;
    }
  | {
      status: "failed" | "skipped";
      reason: string;
      message: string;
      memoryApplied: boolean;
      memoryFailed: boolean;
      run?: XAutoPostRun;
    };

function tokyoDateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

async function reclaimOrClaimTrialSlot(input: {
  userId: string;
  settings: XAutoPostSettings;
  slotKey: string;
}): Promise<
  | { ok: true; run: XAutoPostRun; alreadyDone: boolean }
  | { ok: false; reason: "in_progress" | "already_done"; run?: XAutoPostRun }
> {
  const recent = await listXAutoPostRuns(input.userId, 30);
  const existing = recent.find((run) => run.slotKey === input.slotKey);

  if (existing?.status === "posted" || existing?.status === "drafted") {
    return { ok: false, reason: "already_done", run: existing };
  }
  if (existing?.status === "processing") {
    return { ok: false, reason: "in_progress", run: existing };
  }
  if (existing && (existing.status === "failed" || existing.status === "skipped")) {
    await updateXAutoPostRun(existing.id, {
      status: "processing",
      errorMessage: null,
      text: null,
      tweetId: null,
      tweetUrl: null,
    });
    return { ok: true, run: { ...existing, status: "processing" }, alreadyDone: false };
  }

  const claim = await claimXAutoPostSlot({
    userId: input.userId,
    slotKey: input.slotKey,
    scheduledFor: new Date().toISOString(),
    mode: input.settings.mode,
  });
  if (!claim.claimed) {
    const again = (await listXAutoPostRuns(input.userId, 30)).find(
      (run) => run.slotKey === input.slotKey,
    );
    if (again?.status === "posted" || again?.status === "drafted") {
      return { ok: false, reason: "already_done", run: again };
    }
    return { ok: false, reason: "in_progress", run: again };
  }
  return { ok: true, run: claim.run, alreadyDone: false };
}

export async function runImmediateAutoPostTrial(input: {
  userId: string;
  settings: XAutoPostSettings;
  context: FeatureAccessContext;
  confirm: boolean;
  overrideText?: string | null;
  now?: Date;
}): Promise<AutoPostTrialResult> {
  if (!input.confirm) {
    return {
      status: "failed",
      reason: "confirm_required",
      message: "実際に実行する前に、確認が必要です。",
      memoryApplied: false,
      memoryFailed: false,
    };
  }

  const slotKey = `trial:${tokyoDateKey(input.now ?? new Date())}`;
  const claimed = await reclaimOrClaimTrialSlot({
    userId: input.userId,
    settings: input.settings,
    slotKey,
  });

  if (!claimed.ok) {
    if (claimed.reason === "already_done" && claimed.run) {
      return {
        status: claimed.run.status === "drafted" ? "drafted" : "posted",
        text: claimed.run.text ?? "",
        run: claimed.run,
        memoryApplied: false,
        memoryFailed: false,
        alreadyDone: true,
      };
    }
    return {
      status: "skipped",
      reason: "in_progress",
      message: "いま実行中です。完了までお待ちください。",
      memoryApplied: false,
      memoryFailed: false,
      run: claimed.run,
    };
  }

  const runId = claimed.run.id;
  const memory = await applyMemoryToDedicatedAutoPost({
    userId: input.userId,
    settings: input.settings,
    oneShotText: input.overrideText,
  });

  const featureDenial = (await evaluateBillingFeature(input.userId, "sns_auto_post"))
    .denial;
  const limitDenial = (await evaluateBillingSnsPost(input.userId)).denial;
  if (featureDenial || limitDenial) {
    const message = featureDenial
      ? "プラン制限により実行できません"
      : "今月の利用上限に達しました";
    await updateXAutoPostRun(runId, {
      status: "skipped",
      errorMessage: message,
    });
    return {
      status: "skipped",
      reason: "billing",
      message,
      memoryApplied: memory.applied,
      memoryFailed: memory.memoryFailed,
    };
  }

  const generated = await generateAutoPostText({
    settings: memory.settings,
    postType: selectPostType(Date.now()),
    recentTexts: [],
    slotKey,
    memoryGuidance: memory.guidance,
    hashtagsMax: memory.preference.hashtagsMax,
    memoryApplied: memory.applied,
    memoryFailed: memory.memoryFailed,
  });

  const validation = validateTweetText(generated.text);
  if (validation.errors.length > 0) {
    await updateXAutoPostRun(runId, {
      status: "failed",
      postType: generated.postType,
      text: generated.text,
      errorMessage: validation.errors.join(" / "),
    });
    return {
      status: "failed",
      reason: "validation",
      message: validation.errors.join(" / "),
      memoryApplied: memory.applied,
      memoryFailed: memory.memoryFailed,
    };
  }

  if (input.settings.mode === "approval") {
    const draftResult = await saveXDraftForUser({
      userId: input.userId,
      text: generated.text,
      context: input.context,
    });
    if (draftResult.status !== "ready") {
      const message =
        "message" in draftResult ? draftResult.message : "下書き保存に失敗しました";
      await updateXAutoPostRun(runId, {
        status: "failed",
        postType: generated.postType,
        text: generated.text,
        errorMessage: message,
      });
      return {
        status: "failed",
        reason: "draft_failed",
        message,
        memoryApplied: memory.applied,
        memoryFailed: memory.memoryFailed,
      };
    }
    await updateXAutoPostRun(runId, {
      status: "drafted",
      postType: generated.postType,
      text: generated.text,
    });
    notifyXAutoPostDrafted(input.userId);
    const runs = await listXAutoPostRuns(input.userId, 5);
    return {
      status: "drafted",
      text: generated.text,
      run: runs.find((run) => run.id === runId) ?? claimed.run,
      memoryApplied: memory.applied,
      memoryFailed: memory.memoryFailed,
      alreadyDone: false,
    };
  }

  const result = await postTweetAutoForUser({
    userId: input.userId,
    text: generated.text,
    context: input.context,
  });

  if (result.status === "ready" && result.history?.status === "success") {
    await updateXAutoPostRun(runId, {
      status: "posted",
      postType: generated.postType,
      text: generated.text,
      tweetId: result.history.tweetId,
      tweetUrl: result.history.tweetUrl,
    });
    const runs = await listXAutoPostRuns(input.userId, 5);
    return {
      status: "posted",
      text: generated.text,
      run: runs.find((run) => run.id === runId) ?? claimed.run,
      memoryApplied: memory.applied,
      memoryFailed: memory.memoryFailed,
      alreadyDone: false,
    };
  }

  const message =
    result.status === "ready"
      ? (result.history?.errorMessage ?? "投稿に失敗しました")
      : "message" in result
        ? result.message
        : "投稿に失敗しました";

  await updateXAutoPostRun(runId, {
    status: "failed",
    postType: generated.postType,
    text: generated.text,
    errorMessage: message,
  });
  if (result.status === "x_not_connected" || result.status === "error") {
    notifyXPostFailed(input.userId, message);
  }
  return {
    status: "failed",
    reason: result.status,
    message,
    memoryApplied: memory.applied,
    memoryFailed: memory.memoryFailed,
  };
}
