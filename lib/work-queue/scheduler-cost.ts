/**
 * Scheduler tick cost model. AI calls for Scheduler = 0.
 * Does not invent live billing — these are design-time estimates.
 */

export const SCHEDULER_AI_CALLS_PER_TICK = 0;

export type SchedulerCostScale = {
  users: number;
  ticksPerDay: number;
  ticksPerMonth: number;
  vercelFunctionCallsPerMonth: number;
  githubActionJobsPerMonth: number;
  dbQueriesPerTick: number;
  dbQueriesPerMonth: number;
  workerExecutionsPerMonthAtOneJobPerUserPerDay: number;
  aiCallsPerMonth: number;
};

const MINUTE_TICKS_PER_DAY = 24 * 60;
const DAYS_PER_MONTH = 30;

/**
 * Production minute path is GitHub Actions → /api/automations/tick
 * plus 3 drain fan-out calls. Hobby Vercel cron is 1/day fallback.
 */
export function estimateSchedulerCost(users: number): SchedulerCostScale {
  const ticksPerDay = MINUTE_TICKS_PER_DAY;
  const ticksPerMonth = ticksPerDay * DAYS_PER_MONTH;
  const drainFanout = 3;
  const vercelFunctionCallsPerMonth = ticksPerMonth * (1 + drainFanout);
  const githubActionJobsPerMonth = ticksPerMonth;
  // list owners + hydrate + enqueue + metrics + alerts (order-of-magnitude)
  const dbQueriesPerTick = 8 + Math.ceil(users / 50);
  return {
    users,
    ticksPerDay,
    ticksPerMonth,
    vercelFunctionCallsPerMonth,
    githubActionJobsPerMonth,
    dbQueriesPerTick,
    dbQueriesPerMonth: dbQueriesPerTick * ticksPerMonth,
    workerExecutionsPerMonthAtOneJobPerUserPerDay: users * DAYS_PER_MONTH,
    aiCallsPerMonth: SCHEDULER_AI_CALLS_PER_TICK * ticksPerMonth,
  };
}
