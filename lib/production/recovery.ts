import "server-only";

import { processDisasterQueue } from "@/lib/owner/disaster-recovery/queue";
import { withRetry } from "@/lib/reliability/retry";

import { incrementProductionCounter } from "./metrics";
import { structuredLog } from "./structured-log";
import { dispatchProductionAlert } from "./alerts";

type MemoryScope = typeof globalThis & {
  __atlasGracefulShutdown?: {
    shuttingDown: boolean;
    handlersRegistered: boolean;
    reason: string | null;
  };
};

function shutdownState() {
  const scope = globalThis as MemoryScope;
  if (!scope.__atlasGracefulShutdown) {
    scope.__atlasGracefulShutdown = {
      shuttingDown: false,
      handlersRegistered: false,
      reason: null,
    };
  }
  return scope.__atlasGracefulShutdown;
}

export function isGracefulShutdown(): boolean {
  return shutdownState().shuttingDown;
}

export function beginGracefulShutdown(reason: string): void {
  const state = shutdownState();
  state.shuttingDown = true;
  state.reason = reason;
  structuredLog("warn", "graceful_shutdown_begin", {
    event: "graceful_shutdown",
    status: "degraded",
    meta: { reason },
  });
}

/**
 * Register SIGTERM/SIGINT handlers once (Node/long-running only).
 * On Vercel serverless this is best-effort / no-op if signals unavailable.
 */
export function registerGracefulShutdownHandlers(): void {
  const state = shutdownState();
  if (state.handlersRegistered) return;
  state.handlersRegistered = true;
  const handler = (signal: string) => {
    beginGracefulShutdown(signal);
  };
  try {
    process.on?.("SIGTERM", () => handler("SIGTERM"));
    process.on?.("SIGINT", () => handler("SIGINT"));
  } catch {
    // environment without process signals
  }
}

export type SelfHealResult = {
  drained: number;
  succeeded: number;
  dead: number;
  retried: boolean;
};

/** Self-heal: drain DR queue with retry/backoff (existing DR machinery). */
export function selfHealQueue(): SelfHealResult {
  const before = processDisasterQueue({ now: new Date() });
  incrementProductionCounter("retries", before.processed);
  structuredLog("info", "self_heal_queue", {
    event: "self_heal",
    meta: {
      processed: before.processed,
      succeeded: before.succeeded,
      dead: before.dead,
    },
  });
  return {
    drained: before.processed,
    succeeded: before.succeeded,
    dead: before.dead,
    retried: before.processed > 0,
  };
}

/** Wrap an operation with reliability retry + production counters. */
export async function recoverWithRetry<T>(
  label: string,
  fn: () => Promise<T>,
  options?: { maxAttempts?: number },
): Promise<T> {
  try {
    return await withRetry(async () => fn(), {
      maxAttempts: options?.maxAttempts ?? 3,
      onRetry: () => incrementProductionCounter("retries"),
    });
  } catch (error) {
    incrementProductionCounter("failures");
    await dispatchProductionAlert({
      title: `Recovery failed: ${label}`,
      message: error instanceof Error ? error.message : "unknown",
      severity: "error",
      kind: `recovery_${label}`,
    });
    throw error;
  }
}

export function resetRecoveryForTests(): void {
  (globalThis as MemoryScope).__atlasGracefulShutdown = undefined;
}
