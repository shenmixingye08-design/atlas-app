/**
 * Fail-closed gate: when Scheduler is stopped/disabled,
 * schedule-triggered jobs must not become `completed`.
 *
 * In-process cache is hydrated from durable meta each tick —
 * process memory alone is never the SoT across instances.
 */

import { getWorkQueueStore } from "./store";

const META_KEY_STOPPED = "scheduler_explicitly_stopped";

let explicitStopped = false;
let hydrated = false;

export function setSchedulerExplicitlyStopped(stopped: boolean): void {
  explicitStopped = stopped;
  hydrated = true;
  // Fire-and-forget durable persist (tick hydrate reloads on other instances).
  void persistStoppedFlag(stopped);
}

async function persistStoppedFlag(stopped: boolean): Promise<void> {
  try {
    const store = getWorkQueueStore() as {
      writeSchedulerMeta?: (key: string, value: unknown) => Promise<void>;
    };
    if (typeof store.writeSchedulerMeta === "function") {
      await store.writeSchedulerMeta(META_KEY_STOPPED, { stopped });
      return;
    }
    // File store: also mirror via record path when available.
    const fileStore = getWorkQueueStore() as {
      persistSchedulerGate?: (stopped: boolean) => Promise<void>;
    };
    if (typeof fileStore.persistSchedulerGate === "function") {
      await fileStore.persistSchedulerGate(stopped);
    }
  } catch {
    // Gate still applies in-process for this instance.
  }
}

/** Call at the start of each production tick to sync gate across instances. */
export async function hydrateSchedulerGateFromStore(): Promise<void> {
  try {
    const store = getWorkQueueStore() as {
      readSchedulerMeta?: <T>(key: string, fallback: T) => Promise<T>;
    };
    if (typeof store.readSchedulerMeta === "function") {
      const meta = await store.readSchedulerMeta<{ stopped?: boolean }>(
        META_KEY_STOPPED,
        { stopped: false },
      );
      explicitStopped = Boolean(meta?.stopped);
      hydrated = true;
    }
  } catch {
    // keep cached
  }
}

export function isSchedulerExplicitlyStopped(): boolean {
  return explicitStopped;
}

export function isScheduledCronEnabled(): boolean {
  return process.env.ENABLE_SCHEDULED_CRON?.trim().toLowerCase() !== "false";
}

export function isSchedulerAcceptingCompletions(options?: {
  triggerType?: string | null;
}): { allowed: boolean; code: string; message: string } {
  const trigger = options?.triggerType ?? "automation";
  // Manual / fixture drains remain allowed when scheduler is down.
  if (trigger === "manual" || trigger === "fixture") {
    return { allowed: true, code: "ok", message: "non-schedule trigger" };
  }

  if (!isScheduledCronEnabled()) {
    return {
      allowed: false,
      code: "scheduler_disabled",
      message: "ENABLE_SCHEDULED_CRON=false — schedule completed 禁止",
    };
  }

  if (explicitStopped) {
    return {
      allowed: false,
      code: "scheduler_not_running",
      message: "Scheduler 停止中 — schedule completed 禁止",
    };
  }

  return { allowed: true, code: "ok", message: "scheduler accepting" };
}

export function resetSchedulerGateForTests(): void {
  explicitStopped = false;
  hydrated = false;
}

export function isSchedulerGateHydrated(): boolean {
  return hydrated;
}
