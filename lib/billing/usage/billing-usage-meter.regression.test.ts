/**
 * Permanent CI guard: Billing usage meters use DB SoT, increment only after
 * provider success, and never display 0 when the durable read failed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type CounterRow = {
  user_id: string;
  month_key: string;
  ai_runs: number;
  sns_posts: number;
  x_url_posts: number;
  wordpress_posts: number;
};

type ClaimRow = {
  claim_key: string;
  user_id: string;
  month_key: string;
  meter: string;
  amount: number;
};

const db = vi.hoisted(() => ({
  counters: new Map<string, CounterRow>(),
  claims: new Map<string, ClaimRow>(),
  failReads: false,
  rpcMissing: false,
}));

function counterKey(userId: string, month: string) {
  return `${userId}:${month}`;
}

function ensureCounter(userId: string, month: string): CounterRow {
  const key = counterKey(userId, month);
  const existing = db.counters.get(key);
  if (existing) return existing;
  const created: CounterRow = {
    user_id: userId,
    month_key: month,
    ai_runs: 0,
    sns_posts: 0,
    x_url_posts: 0,
    wordpress_posts: 0,
  };
  db.counters.set(key, created);
  return created;
}

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => ({
    from(table: string) {
      const filters: Record<string, string> = {};
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: string) {
          filters[col] = val;
          return builder;
        },
        async maybeSingle() {
          if (db.failReads) {
            return {
              data: null,
              error: { code: "PGRST002", message: "schema cache unavailable" },
            };
          }
          if (table === "atlas_billing_usage_counters") {
            const row = db.counters.get(
              counterKey(filters.user_id, filters.month_key),
            );
            return { data: row ?? null, error: null };
          }
          return { data: null, error: null };
        },
        then(
          resolve: (value: { data: unknown; error: unknown }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      if (db.rpcMissing) {
        return { data: null, error: { message: "function not found" } };
      }
      const userId = String(args.p_user_id ?? "");
      const month = String(args.p_month_key ?? "");
      if (fn === "atlas_increment_usage_counter_once") {
        const claimKey = String(args.p_claim_key ?? "");
        const meter = String(args.p_meter ?? "");
        const amount = Math.max(1, Number(args.p_amount ?? 1));
        const row = ensureCounter(userId, month);
        const existing = db.claims.get(claimKey);
        const usedNow =
          meter === "ai_runs"
            ? row.ai_runs
            : meter === "sns_posts"
              ? row.sns_posts
              : meter === "x_url_posts"
                ? row.x_url_posts
                : row.wordpress_posts;
        if (existing) {
          return {
            data: {
              ok: true,
              idempotent: true,
              incremented: false,
              used: usedNow,
              meter,
            },
            error: null,
          };
        }
        if (meter === "ai_runs") row.ai_runs += amount;
        if (meter === "sns_posts") row.sns_posts += amount;
        if (meter === "x_url_posts") row.x_url_posts += amount;
        if (meter === "wordpress_posts") row.wordpress_posts += amount;
        db.claims.set(claimKey, {
          claim_key: claimKey,
          user_id: userId,
          month_key: month,
          meter,
          amount,
        });
        const used =
          meter === "ai_runs"
            ? row.ai_runs
            : meter === "sns_posts"
              ? row.sns_posts
              : meter === "x_url_posts"
                ? row.x_url_posts
                : row.wordpress_posts;
        return {
          data: {
            ok: true,
            idempotent: false,
            incremented: true,
            used,
            meter,
          },
          error: null,
        };
      }
      if (fn === "atlas_reserve_ai_run") {
        const claimKey = String(args.p_claim_key ?? "");
        const limit = Number(args.p_limit ?? 0);
        const amount = Math.max(1, Number(args.p_amount ?? 1));
        const row = ensureCounter(userId, month);
        if (db.claims.has(claimKey)) {
          return {
            data: {
              ok: true,
              idempotent: true,
              used: row.ai_runs,
              limit,
            },
            error: null,
          };
        }
        if (row.ai_runs + amount > limit) {
          return {
            data: {
              ok: false,
              idempotent: false,
              used: row.ai_runs,
              limit,
              reason: "limit_reached",
            },
            error: null,
          };
        }
        row.ai_runs += amount;
        db.claims.set(claimKey, {
          claim_key: claimKey,
          user_id: userId,
          month_key: month,
          meter: "ai_runs",
          amount,
        });
        return {
          data: { ok: true, idempotent: false, used: row.ai_runs, limit },
          error: null,
        };
      }
      if (fn === "atlas_sync_ai_runs_from_claims") {
        const row = ensureCounter(userId, month);
        let claimCount = 0;
        for (const claim of db.claims.values()) {
          if (
            claim.user_id === userId &&
            claim.month_key === month &&
            claim.meter === "ai_runs"
          ) {
            claimCount += 1;
          }
        }
        row.ai_runs = Math.max(row.ai_runs, claimCount);
        return { data: { ok: true, used: row.ai_runs, claimCount }, error: null };
      }
      return { data: null, error: { message: `unknown rpc ${fn}` } };
    },
  }),
}));

vi.mock("./automation-inventory", () => ({
  countBillableAutomations: vi.fn(async () => 1),
}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async (userId: string) => {
    if (userId.startsWith("owner_")) return "owner@atlas.test";
    return `${userId}@example.com`;
  }),
}));

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: (email: string | null | undefined) =>
    Boolean(email?.startsWith("owner@") && email.endsWith("@atlas.test")),
}));

import { applySubscriptionFromStripe } from "@/lib/billing/subscriptions/service";
import { resetSubscriptionStore } from "@/lib/billing/subscriptions/store";
import { consumeBillingAiJob } from "@/lib/billing/access/enforce";
import {
  resolveUsageDisplay,
  USAGE_UNAVAILABLE_MESSAGE,
} from "@/lib/billing/usage-awareness/load-state";
import { consumeAiJobQuota } from "./ai-job";
import { consumeAutomationAiOccurrenceOnce } from "./automation-ai";
import { resetBillingUsageDurableForTests } from "./durable";
import { resetAiQuotaEngineForTests } from "./quota-engine";
import {
  recordWordPressPublishUsageOnce,
  recordXPostUsageOnce,
} from "./external-counters";
import {
  hydrateUserUsageMeters,
  resetUsageHydrateInflightForTests,
} from "./hydrate";
import {
  resetUsageEvidenceForTests,
  seedUsageEvidenceForTests,
} from "./reconcile";
import { getUserUsageLimitSummary } from "./service";
import {
  getUsageMonthKey,
  replaceUsageDurableState,
  resetUsageStore,
} from "./store";

const USER = "user_meter_light";
const OWNER = "owner_meter_light";

async function setLight(userId: string) {
  await applySubscriptionFromStripe({
    userId,
    stripeCustomerId: `cus_${userId}`,
    stripeSubscriptionId: `sub_${userId}`,
    planId: "light",
    status: "active",
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
}

async function summary(userId: string) {
  const load = await hydrateUserUsageMeters(userId);
  return { load, usage: getUserUsageLimitSummary(userId) };
}

describe("Billing usage meter isolation (permanent)", () => {
  beforeEach(async () => {
    db.counters.clear();
    db.claims.clear();
    db.failReads = false;
    db.rpcMissing = false;
    resetUsageStore();
    resetUsageHydrateInflightForTests();
    resetBillingUsageDurableForTests();
    resetAiQuotaEngineForTests();
    resetUsageEvidenceForTests();
    resetSubscriptionStore();
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@atlas.test");
    await setLight(USER);
    await setLight(OWNER);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetUsageEvidenceForTests();
  });

  it("CASE A: successful X tweet increments snsPosts 0 → 1", async () => {
    expect((await summary(USER)).usage.snsPosts.used).toBe(0);
    const recorded = await recordXPostUsageOnce({
      userId: USER,
      tweetId: "2090824341797654951",
      text: "MINERVOTから投稿",
    });
    expect(recorded.snsIncremented).toBe(true);
    expect((await summary(USER)).usage.snsPosts.used).toBe(1);
  });

  it("CASE B: same tweetId retry does not double-count", async () => {
    await recordXPostUsageOnce({
      userId: USER,
      tweetId: "2090824341797654951",
      text: "MINERVOTから投稿",
    });
    const retry = await recordXPostUsageOnce({
      userId: USER,
      tweetId: "2090824341797654951",
      text: "MINERVOTから投稿",
    });
    expect(retry.snsIncremented).toBe(false);
    expect((await summary(USER)).usage.snsPosts.used).toBe(1);
  });

  it("CASE C: memory reset still restores 1 from DB SoT", async () => {
    await recordXPostUsageOnce({
      userId: USER,
      tweetId: "2090824341797654951",
      text: "MINERVOTから投稿",
    });
    resetUsageStore();
    resetUsageHydrateInflightForTests();
    const restored = await summary(USER);
    expect(restored.load.ready).toBe(true);
    expect(restored.usage.snsPosts.used).toBe(1);
  });

  it("CASE D: URL tweet increments snsPosts and xUrlPosts once each", async () => {
    await recordXPostUsageOnce({
      userId: USER,
      tweetId: "tw_url_1",
      text: "資料は https://atlasapp.jp です",
    });
    const usage = (await summary(USER)).usage;
    expect(usage.snsPosts.used).toBe(1);
    expect(usage.xUrlPosts.used).toBe(1);
  });

  it("CASE E: WordPress draft does not increment wordpressPosts", async () => {
    const src = readFileSync(
      join(process.cwd(), "lib/integrations/wordpress/post/service.ts"),
      "utf8",
    );
    expect(src).toContain('status === "publish" ? "posted" : "draft_saved"');
    expect(src).toMatch(
      /if \(status === "publish" && created\.id != null\)[\s\S]*recordWordPressPublishUsageOnce/,
    );
    expect((await summary(USER)).usage.wordpressPosts.used).toBe(0);
  });

  it("legacy blob hydrate does not clobber DB SoT meters", async () => {
    await recordXPostUsageOnce({
      userId: USER,
      tweetId: "tw_preserve",
      text: "ok",
    });
    const month = getUsageMonthKey();
    replaceUsageDurableState({
      snapshots: {
        [`${USER}:${month}`]: {
          userId: USER,
          month,
          aiRuns: 0,
          snsPosts: 0,
          xUrlPosts: 0,
          wordpressPosts: 0,
          automationTasksActive: 0,
          updatedAt: new Date().toISOString(),
        },
      },
      events: [],
    });
    expect(getUserUsageLimitSummary(USER).snsPosts.used).toBe(1);
  });

  it("CASE F/G: WordPress publish +1 and same postId retry +0", async () => {
    const first = await recordWordPressPublishUsageOnce({
      userId: USER,
      postId: 88,
    });
    const retry = await recordWordPressPublishUsageOnce({
      userId: USER,
      postId: 88,
    });
    expect(first.incremented).toBe(true);
    expect(retry.incremented).toBe(false);
    expect((await summary(USER)).usage.wordpressPosts.used).toBe(1);
  });

  it("CASE H/I: one AI job increments once; retry keeps 1", async () => {
    const first = await consumeAiJobQuota({
      userId: USER,
      claimKey: "work_job:job-1",
    });
    const retry = await consumeAiJobQuota({
      userId: USER,
      claimKey: "work_job:job-1",
    });
    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    if (retry.ok) expect(retry.idempotent).toBe(true);
    expect((await summary(USER)).usage.aiRuns.used).toBe(1);
  });

  it("CASE J: scheduled automation AI occurrence +1; retry stays 1", async () => {
    const first = await consumeAutomationAiOccurrenceOnce({
      userId: USER,
      occurrenceKey: "2026-08-23T09:00:00+09:00",
    });
    const retry = await consumeAutomationAiOccurrenceOnce({
      userId: USER,
      occurrenceKey: "2026-08-23T09:00:00+09:00",
    });
    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    expect((await summary(USER)).usage.aiRuns.used).toBe(1);
  });

  it("CASE K: owner Light meters 1/30 and 31/30 but 31st still runs", async () => {
    const first = await consumeAiJobQuota({
      userId: OWNER,
      claimKey: "owner-job-1",
    });
    expect(first.ok).toBe(true);
    expect((await summary(OWNER)).usage.aiRuns).toMatchObject({
      used: 1,
      limit: 30,
    });

    for (let i = 2; i <= 31; i += 1) {
      const reserved = await consumeAiJobQuota({
        userId: OWNER,
        claimKey: `owner-job-${i}`,
      });
      expect(reserved.ok).toBe(true);
    }
    const after = await summary(OWNER);
    expect(after.usage.aiRuns.used).toBe(31);
    expect(after.usage.aiRuns.limit).toBe(30);
    const denied = await consumeBillingAiJob(OWNER, "owner-job-32");
    expect(denied).toBeNull();
    expect((await summary(OWNER)).usage.aiRuns.used).toBe(32);
  });

  it("CASE L: durable read failure is unavailable, never 0/30", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    db.failReads = true;
    const loaded = await summary(USER);
    expect(loaded.load.ready).toBe(false);
    const display = resolveUsageDisplay({
      ready: loaded.load.ready,
      used: loaded.usage.aiRuns.used,
      limit: loaded.usage.aiRuns.limit,
    });
    expect(display).toEqual({
      kind: "unavailable",
      message: USAGE_UNAVAILABLE_MESSAGE,
    });
  });

  it("CASE M: concurrent hydrates share one in-flight promise", async () => {
    await recordXPostUsageOnce({
      userId: USER,
      tweetId: "tw_share",
      text: "ok",
    });
    resetUsageHydrateInflightForTests();
    const first = hydrateUserUsageMeters(USER);
    const second = hydrateUserUsageMeters(USER);
    expect(first).toBe(second);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(a.ready).toBe(true);
    expect(getUserUsageLimitSummary(USER).snsPosts.used).toBe(1);
  });

  it("CASE N: pre-fix X evidence reconciles 0 → 1 and stays 1", async () => {
    seedUsageEvidenceForTests(USER, [
      {
        provider: "x",
        actionType: "post",
        resourceId: "2090824341797654951",
        text: "本番投稿",
      },
    ]);
    const first = await summary(USER);
    expect(first.load.ready).toBe(true);
    expect(first.usage.snsPosts.used).toBe(1);
    resetUsageHydrateInflightForTests();
    const second = await summary(USER);
    expect(second.usage.snsPosts.used).toBe(1);
  });

  it("concurrent same tweetId does not double-count", async () => {
    const [a, b] = await Promise.all([
      recordXPostUsageOnce({
        userId: USER,
        tweetId: "tw_race",
        text: "ok",
      }),
      recordXPostUsageOnce({
        userId: USER,
        tweetId: "tw_race",
        text: "ok",
      }),
    ]);
    expect(Number(a.snsIncremented) + Number(b.snsIncremented)).toBe(1);
    expect((await summary(USER)).usage.snsPosts.used).toBe(1);
  });

  it("different claim / meter / month / user stay independent", async () => {
    await recordXPostUsageOnce({
      userId: USER,
      tweetId: "tw_a",
      text: "ok",
    });
    await recordXPostUsageOnce({
      userId: USER,
      tweetId: "tw_b",
      text: "ok",
    });
    await recordWordPressPublishUsageOnce({ userId: USER, postId: 9 });
    const other = "user_meter_other";
    await setLight(other);
    await recordXPostUsageOnce({
      userId: other,
      tweetId: "tw_other",
      text: "ok",
    });
    expect((await summary(USER)).usage.snsPosts.used).toBe(2);
    expect((await summary(USER)).usage.wordpressPosts.used).toBe(1);
    expect((await summary(other)).usage.snsPosts.used).toBe(1);
  });
});
