import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type { SchedulerQueueSnapshot } from "./types";

type StatusCount = {
  status: string;
  count: number;
};

function emptySnapshot(): SchedulerQueueSnapshot {
  return {
    queueSize: 0,
    runningJobs: 0,
    waitingJobs: 0,
    failedJobs: 0,
    retryingJobs: 0,
  };
}

function fromCounts(counts: StatusCount[]): SchedulerQueueSnapshot {
  const map = new Map(counts.map((c) => [c.status, c.count]));
  const runningJobs = map.get("running") ?? 0;
  const waitingJobs =
    (map.get("queued") ?? 0) +
    (map.get("scheduled") ?? 0) +
    (map.get("waiting_for_approval") ?? 0);
  const retryingJobs = map.get("retrying") ?? 0;
  const failedJobs = map.get("failed") ?? 0;
  return {
    queueSize: waitingJobs + retryingJobs + runningJobs,
    runningJobs,
    waitingJobs,
    failedJobs,
    retryingJobs,
  };
}

function listMemoryJobStatuses(): StatusCount[] {
  const scope = globalThis as typeof globalThis & {
    __atlasAutomationJobs?: Map<string, { status: string }>;
  };
  const store = scope.__atlasAutomationJobs;
  if (!store) return [];
  const tallies = new Map<string, number>();
  for (const row of store.values()) {
    tallies.set(row.status, (tallies.get(row.status) ?? 0) + 1);
  }
  return [...tallies.entries()].map(([status, count]) => ({ status, count }));
}

/** Best-effort queue snapshot from durable jobs (memory fallback). */
export async function getSchedulerQueueSnapshot(): Promise<SchedulerQueueSnapshot> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return fromCounts(listMemoryJobStatuses());
  }

  try {
    const statuses = [
      "queued",
      "scheduled",
      "running",
      "retrying",
      "waiting_for_approval",
      "failed",
    ] as const;
    const counts: StatusCount[] = [];
    for (const status of statuses) {
      const { count, error } = await client
        .from("atlas_automation_jobs")
        .select("*", { count: "exact", head: true })
        .eq("status", status);
      if (error) continue;
      counts.push({ status, count: count ?? 0 });
    }
    if (counts.length === 0) return fromCounts(listMemoryJobStatuses());
    return fromCounts(counts);
  } catch {
    return fromCounts(listMemoryJobStatuses()) || emptySnapshot();
  }
}
