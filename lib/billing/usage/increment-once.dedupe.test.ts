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

const db = vi.hoisted(() => ({
  counters: new Map<string, CounterRow>(),
  claims: new Map<string, { claim_key: string; meter: string }>(),
}));

function key(userId: string, month: string) {
  return `${userId}:${month}`;
}

function ensure(userId: string, month: string): CounterRow {
  const existing = db.counters.get(key(userId, month));
  if (existing) return existing;
  const created: CounterRow = {
    user_id: userId,
    month_key: month,
    ai_runs: 0,
    sns_posts: 0,
    x_url_posts: 0,
    wordpress_posts: 0,
  };
  db.counters.set(key(userId, month), created);
  return created;
}

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => ({
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: null, error: null };
        },
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn !== "atlas_increment_usage_counter_once") {
        return { data: null, error: { message: `unknown ${fn}` } };
      }
      const userId = String(args.p_user_id ?? "");
      const month = String(args.p_month_key ?? "");
      const claimKey = String(args.p_claim_key ?? "");
      const meter = String(args.p_meter ?? "ai_runs");
      const amount = Math.max(1, Number(args.p_amount ?? 1));
      const existing = db.claims.get(claimKey);
      const row = ensure(userId, month);
      if (existing) {
        return {
          data: {
            ok: true,
            idempotent: true,
            incremented: false,
            used: row.ai_runs,
          },
          error: null,
        };
      }
      if (meter === "ai_runs") row.ai_runs += amount;
      if (meter === "sns_posts") row.sns_posts += amount;
      db.claims.set(claimKey, { claim_key: claimKey, meter });
      return {
        data: {
          ok: true,
          idempotent: false,
          incremented: true,
          used: meter === "sns_posts" ? row.sns_posts : row.ai_runs,
        },
        error: null,
      };
    },
  }),
}));

import { incrementDurableUsageOnce } from "./durable-counters";
import { resetUsageStore } from "./store";

describe("billing usage increment once", () => {
  beforeEach(() => {
    db.counters.clear();
    db.claims.clear();
    resetUsageStore();
  });

  afterEach(() => {
    db.counters.clear();
    db.claims.clear();
  });

  it("increments once for the same claim key", async () => {
    const first = await incrementDurableUsageOnce({
      userId: "user_bill_1",
      claimKey: "claim_same",
      meter: "ai_runs",
      month: "2026-08",
    });
    const second = await incrementDurableUsageOnce({
      userId: "user_bill_1",
      claimKey: "claim_same",
      meter: "ai_runs",
      month: "2026-08",
    });
    expect(first.incremented).toBe(true);
    expect(first.used).toBe(1);
    expect(second.incremented).toBe(false);
    expect(second.used).toBe(1);
  });

  it("increments for different claim keys", async () => {
    const a = await incrementDurableUsageOnce({
      userId: "user_bill_2",
      claimKey: "claim_a",
      meter: "ai_runs",
      month: "2026-08",
    });
    const b = await incrementDurableUsageOnce({
      userId: "user_bill_2",
      claimKey: "claim_b",
      meter: "ai_runs",
      month: "2026-08",
    });
    expect(a.incremented).toBe(true);
    expect(b.incremented).toBe(true);
    expect(b.used).toBe(2);
  });

  it("does not double increment concurrent duplicates", async () => {
    const [one, two] = await Promise.all([
      incrementDurableUsageOnce({
        userId: "user_bill_3",
        claimKey: "claim_race",
        meter: "ai_runs",
        month: "2026-08",
      }),
      incrementDurableUsageOnce({
        userId: "user_bill_3",
        claimKey: "claim_race",
        meter: "ai_runs",
        month: "2026-08",
      }),
    ]);
    const incremented = [one, two].filter((row) => row.incremented).length;
    expect(incremented).toBe(1);
    expect(Math.max(one.used, two.used)).toBe(1);
  });

  it("separates months and meters", async () => {
    const aug = await incrementDurableUsageOnce({
      userId: "user_bill_4",
      claimKey: "claim_month_aug",
      meter: "ai_runs",
      month: "2026-08",
    });
    const sep = await incrementDurableUsageOnce({
      userId: "user_bill_4",
      claimKey: "claim_month_sep",
      meter: "ai_runs",
      month: "2026-09",
    });
    const sns = await incrementDurableUsageOnce({
      userId: "user_bill_4",
      claimKey: "claim_sns",
      meter: "sns_posts",
      month: "2026-08",
    });
    expect(aug.used).toBe(1);
    expect(sep.used).toBe(1);
    expect(sns.used).toBe(1);
  });
});
