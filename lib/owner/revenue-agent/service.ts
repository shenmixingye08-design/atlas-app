import "server-only";

import { randomUUID } from "node:crypto";

import { recordOpenAiUsageFromCostSummary } from "@/lib/owner/api-usage/telemetry";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";

import { assertPublishableCopy } from "./claims";
import { defaultRevenueGoals, emptyMetrics, unknownMetricSources } from "./defaults";
import {
  ensureRevenueAgentHydrated,
  schedulePersistRevenueAgent,
} from "./durable";
import { generateRevenueBatch, tokyoDateKey } from "./generate";
import { buildRevenueInsights } from "./insights";
import { publishRevenueItemToX } from "./publish";
import { canPublishNow } from "./publish-policy";
import {
  addGenerationCost,
  getLastGeneratedOn,
  getRevenueGoals,
  getRevenueItem,
  listGenerationCosts,
  listRevenueItems,
  setLastGeneratedOn,
  setRevenueGoals,
  upsertRevenueItem,
} from "./store";
import type {
  GenerateMode,
  RevenueAgentSnapshot,
  RevenueAgentStatus,
  RevenueContent,
  RevenueGoals,
  RevenueMetricKey,
  RevenueMetrics,
  RevenueXConnectionView,
} from "./types";
import { REVENUE_AGENT_STATUSES } from "./types";
import { buildRevenueUtmUrl } from "./utm";

async function xConnectionView(userId: string): Promise<RevenueXConnectionView> {
  try {
    await ensureExternalAuthHydrated(userId);
    const connection = getExternalServiceConnection(userId, "x");
    if (connection.status === "connected") {
      return { connected: true, message: "Xは接続済みです。承認後に投稿できます。" };
    }
    return {
      connected: false,
      message:
        "Xが未連携です。設定の外部連携から運営アカウントを接続してください。未接続のまま成功扱いにしません。",
    };
  } catch {
    return {
      connected: false,
      message: "X連携の状態を確認できませんでした。未接続として扱います。",
    };
  }
}

export async function getRevenueAgentSnapshot(
  userId: string,
): Promise<RevenueAgentSnapshot> {
  await ensureRevenueAgentHydrated();
  const items = listRevenueItems();
  return {
    goals: getRevenueGoals(),
    items,
    costs: listGenerationCosts(),
    insights: buildRevenueInsights(items),
    xConnection: await xConnectionView(userId),
    lastGeneratedOn: getLastGeneratedOn(),
    generatedAt: new Date().toISOString(),
  };
}

export function parseGoalsPatch(body: unknown): Partial<RevenueGoals> | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid JSON body" };
  const raw = body as Record<string, unknown>;
  const next: Partial<RevenueGoals> = {};
  if (typeof raw.periodStart === "string") next.periodStart = raw.periodStart;
  if (typeof raw.periodEnd === "string") next.periodEnd = raw.periodEnd;
  if (typeof raw.lpUrl === "string") next.lpUrl = raw.lpUrl.trim();
  if (typeof raw.targetAudience === "string") next.targetAudience = raw.targetAudience.trim();
  if (typeof raw.dailyPostTarget === "number" && raw.dailyPostTarget > 0) {
    next.dailyPostTarget = Math.min(10, Math.floor(raw.dailyPostTarget));
  }
  if (Array.isArray(raw.platforms)) {
    next.platforms = raw.platforms.filter(
      (value): value is RevenueGoals["platforms"][number] =>
        value === "x" || value === "tiktok" || value === "youtube_shorts",
    );
    if (next.platforms.length === 0) next.platforms = ["x"];
  }
  if (typeof raw.requireApproval === "boolean") next.requireApproval = raw.requireApproval;
  if (Array.isArray(raw.bannedPhrases)) {
    next.bannedPhrases = raw.bannedPhrases
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  if (typeof raw.brandTone === "string") next.brandTone = raw.brandTone.trim();
  if (typeof raw.cta === "string") next.cta = raw.cta.trim();
  if (raw.monthlySignupGoal === null) next.monthlySignupGoal = null;
  if (typeof raw.monthlySignupGoal === "number") {
    next.monthlySignupGoal = raw.monthlySignupGoal;
  }
  if (raw.monthlyRevenueGoalYen === null) next.monthlyRevenueGoalYen = null;
  if (typeof raw.monthlyRevenueGoalYen === "number") {
    next.monthlyRevenueGoalYen = raw.monthlyRevenueGoalYen;
  }
  return next;
}

export async function updateRevenueGoals(
  patch: Partial<RevenueGoals>,
): Promise<RevenueGoals> {
  await ensureRevenueAgentHydrated();
  const current = getRevenueGoals();
  const next = setRevenueGoals({
    ...defaultRevenueGoals(),
    ...current,
    ...patch,
    platforms: patch.platforms ?? current.platforms,
    bannedPhrases: patch.bannedPhrases ?? current.bannedPhrases,
  });
  schedulePersistRevenueAgent();
  return next;
}

export async function generateRevenuePlans(input: {
  mode: GenerateMode;
}): Promise<{ created: number; skipped: boolean; usedAi: boolean }> {
  await ensureRevenueAgentHydrated();
  const today = tokyoDateKey();
  if (input.mode === "daily" && getLastGeneratedOn() === today) {
    return { created: 0, skipped: true, usedAi: false };
  }

  const goals = getRevenueGoals();
  const items = listRevenueItems();
  const insights = buildRevenueInsights(items);
  const batch = await generateRevenueBatch({
    goals,
    insights,
    existingBodies: items.map((item) => item.body),
    mode: input.mode,
  });

  for (const item of batch.items) {
    upsertRevenueItem(item);
  }
  if (batch.cost) {
    addGenerationCost(batch.cost);
    recordOpenAiUsageFromCostSummary(
      {
        llmCallCount: 1,
        cacheHits: 0,
        cacheMisses: 1,
        estimatedInputTokens: batch.cost.inputTokens,
        estimatedOutputTokens: batch.cost.outputTokens,
        estimatedCostUsd: batch.cost.estimatedCostUsd,
        departmentBreakdown: {
          "revenue-agent": {
            calls: 1,
            estimatedCostUsd: batch.cost.estimatedCostUsd,
            estimatedInputTokens: batch.cost.inputTokens,
            estimatedOutputTokens: batch.cost.outputTokens,
          },
        },
        calls: [],
        limitsReached: false,
      },
      "orchestration",
    );
  }
  setLastGeneratedOn(today);
  schedulePersistRevenueAgent();
  return {
    created: batch.items.length,
    skipped: false,
    usedAi: batch.usedAi,
  };
}

function touch(item: RevenueContent): RevenueContent {
  return { ...item, updatedAt: new Date().toISOString() };
}

export async function editRevenueItem(
  id: string,
  patch: Partial<Pick<RevenueContent, "title" | "hook" | "body" | "cta" | "scheduledAt">>,
): Promise<RevenueContent> {
  await ensureRevenueAgentHydrated();
  const current = getRevenueItem(id);
  if (!current) throw new Error("企画が見つかりません");
  if (current.status === "published") {
    throw new Error("公開済みの本文は編集できません");
  }
  const goals = getRevenueGoals();
  const next = touch({
    ...current,
    title: patch.title?.trim() || current.title,
    hook: patch.hook?.trim() || current.hook,
    body: patch.body?.trim() || current.body,
    cta: patch.cta?.trim() || current.cta,
    scheduledAt:
      patch.scheduledAt === undefined ? current.scheduledAt : patch.scheduledAt,
  });
  assertPublishableCopy([next.title, next.hook, next.body, next.cta], goals);
  next.utmUrl = buildRevenueUtmUrl({
    lpUrl: goals.lpUrl,
    platform: next.platform,
    kind: next.kind,
    contentId: next.id,
  });
  upsertRevenueItem(next);
  schedulePersistRevenueAgent();
  return next;
}

export async function transitionRevenueItem(
  id: string,
  action:
    | "approve"
    | "reject"
    | "schedule"
    | "mark_published"
    | "retry"
    | "submit",
  extra?: { scheduledAt?: string },
): Promise<RevenueContent> {
  await ensureRevenueAgentHydrated();
  const current = getRevenueItem(id);
  if (!current) throw new Error("企画が見つかりません");
  const now = new Date().toISOString();
  let status: RevenueAgentStatus = current.status;

  if (action === "submit") {
    if (current.status !== "draft" && current.status !== "rejected") {
      throw new Error("下書きまたは却下だけ承認待ちにできます");
    }
    status = "pending_approval";
  } else if (action === "approve") {
    if (current.status !== "pending_approval" && current.status !== "draft") {
      throw new Error("承認待ち（または下書き）だけ承認できます");
    }
    status = "approved";
  } else if (action === "reject") {
    if (current.status === "published") {
      throw new Error("公開済みは却下できません");
    }
    status = "rejected";
  } else if (action === "schedule") {
    if (current.status !== "approved" && current.status !== "scheduled") {
      throw new Error("承認後に投稿日時を指定できます");
    }
    if (!extra?.scheduledAt) throw new Error("投稿日時が必要です");
    status = "scheduled";
  } else if (action === "mark_published") {
    if (current.platform === "x" && !current.xTweetId) {
      throw new Error("Xは自動投稿のIDがある場合だけ公開済みにします。手動の偽成功は保存しません。");
    }
    status = "published";
  } else if (action === "retry") {
    if (current.status !== "failed") throw new Error("失敗した企画だけ再実行できます");
    status = current.scheduledAt ? "scheduled" : "approved";
  }

  if (!REVENUE_AGENT_STATUSES.includes(status)) {
    throw new Error("不正な状態です");
  }

  const next = touch({
    ...current,
    status,
    scheduledAt:
      action === "schedule" ? extra?.scheduledAt ?? null : current.scheduledAt,
    publishedAt: action === "mark_published" ? now : current.publishedAt,
    lastError: action === "retry" ? null : current.lastError,
  });
  upsertRevenueItem(next);
  schedulePersistRevenueAgent();
  return next;
}

export async function publishRevenueItem(
  id: string,
  userId: string,
): Promise<RevenueContent> {
  await ensureRevenueAgentHydrated();
  const current = getRevenueItem(id);
  if (!current) throw new Error("企画が見つかりません");
  const existing = current.idempotencyKey
    ? listRevenueItems().find(
        (row) =>
          row.id !== current.id &&
          row.idempotencyKey === current.idempotencyKey &&
          row.xTweetId,
      )
    : null;
  if (existing?.xTweetId) {
    const next = touch({
      ...current,
      status: "published",
      xTweetId: existing.xTweetId,
      postUrl: existing.postUrl,
      publishedAt: existing.publishedAt,
      lastError: null,
    });
    upsertRevenueItem(next);
    schedulePersistRevenueAgent();
    return next;
  }
  if (current.xTweetId) return current;

  const published = await publishRevenueItemToX({
    item: current,
    goals: getRevenueGoals(),
    userId,
  });
  upsertRevenueItem(published);
  schedulePersistRevenueAgent();
  return published;
}

export async function publishDueScheduled(userId: string): Promise<number> {
  await ensureRevenueAgentHydrated();
  let count = 0;
  for (const item of listRevenueItems()) {
    if (!canPublishNow(item)) continue;
    if (item.platform !== "x") continue;
    await publishRevenueItem(item.id, userId);
    count += 1;
  }
  return count;
}

export async function updateRevenueMetrics(
  id: string,
  metrics: Partial<RevenueMetrics>,
): Promise<RevenueContent> {
  await ensureRevenueAgentHydrated();
  const current = getRevenueItem(id);
  if (!current) throw new Error("企画が見つかりません");
  const nextMetrics = { ...current.metrics };
  const nextSource = { ...current.metricSource };
  (Object.keys(metrics) as RevenueMetricKey[]).forEach((key) => {
    const value = metrics[key];
    if (value === undefined) return;
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`${key} は 0 以上の数値か、未取得の null です`);
    }
    nextMetrics[key] = value;
    nextSource[key] = value == null ? "unknown" : "manual";
  });
  const next = touch({
    ...current,
    metrics: nextMetrics,
    metricSource: nextSource,
  });
  upsertRevenueItem(next);
  schedulePersistRevenueAgent();
  return next;
}

export async function regenerateRevenueItem(id: string): Promise<RevenueContent> {
  await ensureRevenueAgentHydrated();
  const current = getRevenueItem(id);
  if (!current) throw new Error("企画が見つかりません");
  if (current.status === "published") {
    throw new Error("公開済みは再生成できません");
  }
  const batch = await generateRevenueBatch({
    goals: getRevenueGoals(),
    insights: buildRevenueInsights(listRevenueItems()),
    existingBodies: listRevenueItems()
      .filter((item) => item.id !== id)
      .map((item) => item.body),
    mode: "force",
  });
  const replacement =
    batch.items.find((item) => item.kind === current.kind) ?? batch.items[0];
  if (!replacement) throw new Error("再生成に失敗しました");
  const next = touch({
    ...replacement,
    id: current.id,
    idempotencyKey: current.idempotencyKey || `ra_pub_${current.id}`,
    campaign: current.campaign,
    status: "pending_approval",
  });
  upsertRevenueItem(next);
  if (batch.cost) {
    addGenerationCost({
      ...batch.cost,
      id: `cost_${randomUUID()}`,
    });
  }
  schedulePersistRevenueAgent();
  return next;
}

export { emptyMetrics, unknownMetricSources };
