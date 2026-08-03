import "server-only";

import type { DurableSotPool } from "../db";
import { DURABLE_SOT_TABLES } from "../schema";

const T = DURABLE_SOT_TABLES.leaseMetrics;

type Queryable = Pick<DurableSotPool, "query">;

export type DurableLeaseMetricsSnapshot = {
  activeLeases: number;
  expiredLeases: number;
  leaseConflictCount: number;
  heartbeatFailureCount: number;
  stuckJobCount: number;
  recoveryAttemptCount: number;
  recoverySuccessCount: number;
  recoveryFailureCount: number;
  zombieWriteRejectedCount: number;
  averageRecoveryTimeMs: number | null;
  p95RecoveryTimeMs: number | null;
};

const COUNTER_KEYS = [
  "leaseConflictCount",
  "heartbeatFailureCount",
  "stuckJobCount",
  "recoveryAttemptCount",
  "recoverySuccessCount",
  "recoveryFailureCount",
  "zombieWriteRejectedCount",
  "recoveryTimeSumMs",
  "recoveryTimeCount",
  "recoveryTimeP95Buffer",
] as const;

export class DurableLeaseMetricsRepository {
  constructor(private readonly db: Queryable) {}

  async increment(key: string, by = 1): Promise<void> {
    await this.db.query(
      `insert into public.${T} (metric_key, metric_value, updated_at)
       values ($1, $2, now())
       on conflict (metric_key) do update set
         metric_value = public.${T}.metric_value + excluded.metric_value,
         updated_at = now()`,
      [key, by],
    );
  }

  async recordRecoveryDurationMs(durationMs: number): Promise<void> {
    await this.increment("recoveryTimeSumMs", durationMs);
    await this.increment("recoveryTimeCount", 1);
    // Keep a rolling approx of last durations in a JSON array (cap 200).
    await this.db.query(
      `insert into public.${T} (metric_key, metric_value, updated_at)
       values ('recoveryTimeP95Buffer', 0, now())
       on conflict (metric_key) do nothing`,
    );
    // Store latest sample as sidecar row key with timestamp suffix is heavy;
    // instead append into a text blob table via dedicated key samples.
    await this.db.query(
      `insert into public.${T} (metric_key, metric_value, updated_at)
       values ($1, $2, now())
       on conflict (metric_key) do update set
         metric_value = excluded.metric_value,
         updated_at = now()`,
      [`recoverySample:${Date.now()}:${Math.random()}`, durationMs],
    );
  }

  async getCounter(key: string): Promise<number> {
    const res = await this.db.query<{ metric_value: number }>(
      `select metric_value from public.${T} where metric_key = $1`,
      [key],
    );
    return Number(res.rows[0]?.metric_value ?? 0);
  }

  async snapshot(live: {
    activeLeases: number;
    expiredLeases: number;
    stuckJobCount: number;
  }): Promise<DurableLeaseMetricsSnapshot> {
    const counters: Record<string, number> = {};
    for (const key of COUNTER_KEYS) {
      counters[key] = await this.getCounter(key);
    }
    const samplesRes = await this.db.query<{ metric_value: number }>(
      `select metric_value from public.${T}
       where metric_key like 'recoverySample:%'
       order by updated_at desc
       limit 200`,
    );
    const samples = samplesRes.rows
      .map((r) => Number(r.metric_value))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    const avg =
      counters.recoveryTimeCount > 0
        ? counters.recoveryTimeSumMs / counters.recoveryTimeCount
        : null;
    const p95 =
      samples.length === 0
        ? null
        : samples[
            Math.min(
              samples.length - 1,
              Math.ceil(0.95 * samples.length) - 1,
            )
          ]!;

    return {
      activeLeases: live.activeLeases,
      expiredLeases: live.expiredLeases,
      leaseConflictCount: counters.leaseConflictCount ?? 0,
      heartbeatFailureCount: counters.heartbeatFailureCount ?? 0,
      stuckJobCount: live.stuckJobCount,
      recoveryAttemptCount: counters.recoveryAttemptCount ?? 0,
      recoverySuccessCount: counters.recoverySuccessCount ?? 0,
      recoveryFailureCount: counters.recoveryFailureCount ?? 0,
      zombieWriteRejectedCount: counters.zombieWriteRejectedCount ?? 0,
      averageRecoveryTimeMs: avg,
      p95RecoveryTimeMs: p95,
    };
  }

  async resetForTests(): Promise<void> {
    await this.db.query(`truncate table public.${T}`);
  }
}
