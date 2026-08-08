/**
 * P1-02 Production smoke: exercise the same drain path as /api/automations/tick
 * against durable inbox + DLQ + P1-04 side-effect claims.
 * Uses an isolated probe owner id; cleans up after itself.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { executeIdempotentSideEffect } from "@/lib/side-effects/execute";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  insertDurableNotification,
  listDueDeliveryRetries,
  scheduleDurableDeliveryRetry,
  updateDurableDeliveryState,
  type DurableInboxRow,
} from "./durable-inbox";
import { listNotificationDlq } from "./dlq";
import { processDurableNotificationRetries } from "./retry-drain";
import type { NotificationRecord } from "./types";

export const P102_PROBE_OWNER = "__atlas_p102_probe__";

export type NotificationRetryProductionSmoke = {
  ok: boolean;
  drainOk: boolean;
  noDoubleSendOk: boolean;
  dlqTerminalOk: boolean;
  dlqNotReinjectedOk: boolean;
  error: string | null;
  evidence: {
    drain: {
      due: number;
      claimed: number;
      delivered: number;
      dlqReinjected: number;
    } | null;
    secondDrainDue: number | null;
    deadLettered: number | null;
    dlqDeadRows: number | null;
    sideEffectExecuteCalls: number | null;
  };
};

function baseRecord(input: {
  notificationId: string;
  requestId: string;
  lineEvent?: NotificationRecord["lineEvent"];
}): NotificationRecord {
  const now = new Date().toISOString();
  return {
    notificationId: input.notificationId,
    userId: P102_PROBE_OWNER,
    audience: "user",
    type: "automation",
    title: "p1-02 probe",
    message: "production smoke",
    relatedTaskId: null,
    relatedService: null,
    isRead: false,
    createdAt: now,
    actionUrl: null,
    requestId: input.requestId,
    automationId: "p102_probe_auto",
    lineEvent: input.lineEvent ?? null,
  };
}

async function cleanupProbeArtifacts(): Promise<void> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return;
  const now = new Date().toISOString();
  await client
    .from("atlas_user_notifications")
    .update({ deleted_at: now, updated_at: now })
    .eq("owner_id", P102_PROBE_OWNER);
  await client
    .from("atlas_notification_dlq")
    .delete()
    .eq("user_id", P102_PROBE_OWNER);
  await client
    .from("atlas_side_effect_claims")
    .delete()
    .eq("user_id", P102_PROBE_OWNER);
}

export async function runNotificationRetryProductionSmoke(): Promise<NotificationRetryProductionSmoke> {
  const evidence: NotificationRetryProductionSmoke["evidence"] = {
    drain: null,
    secondDrainDue: null,
    deadLettered: null,
    dlqDeadRows: null,
    sideEffectExecuteCalls: null,
  };

  let drainOk = false;
  let noDoubleSendOk = false;
  let dlqTerminalOk = false;
  let dlqNotReinjectedOk = false;

  try {
    await cleanupProbeArtifacts();

    // 1) Drain path (same function as automation tick): email channel has no
    // external fan-out → redeliverChannels returns ok without provider calls.
    const drainId = `p102_drain_${randomUUID().slice(0, 8)}`;
    const drainInsert = await insertDurableNotification(
      baseRecord({
        notificationId: drainId,
        requestId: `req_${drainId}`,
      }),
      {
        idempotencyKey: `p102:drain:${drainId}`,
        channel: "email" satisfies DurableInboxRow["channel"],
        sourceType: "p102_smoke",
        sourceId: drainId,
      },
    );
    await scheduleDurableDeliveryRetry({
      notificationId: drainInsert.row.notificationId,
      ownerId: P102_PROBE_OWNER,
      errorMessage: "p102_smoke_seed",
      delayMs: 0,
    });

    const drain = await processDurableNotificationRetries({
      limit: 50,
      nowMs: Date.now() + 5_000,
      leaseOwner: `p102_smoke_${randomUUID().slice(0, 6)}`,
    });
    evidence.drain = {
      due: drain.due,
      claimed: drain.claimed,
      delivered: drain.delivered,
      dlqReinjected: drain.dlqReinjected,
    };
    drainOk =
      drain.claimed >= 1 &&
      drain.delivered >= 1 &&
      drain.dlqReinjected === 0;

    // 2) Second drain must not re-process the delivered row (no double send).
    const dueAfter = await listDueDeliveryRetries({
      limit: 100,
      nowMs: Date.now() + 60_000,
    });
    const stillDue = dueAfter.some(
      (row) => row.notificationId === drainInsert.row.notificationId,
    );
    evidence.secondDrainDue = dueAfter.filter(
      (row) => row.ownerId === P102_PROBE_OWNER,
    ).length;

    // P1-04 path used by channel redelivery: execute once, reuse must not re-run.
    let sideEffectCalls = 0;
    const sideKey = `p102_side_${randomUUID().slice(0, 8)}`;
    const sideCtx = {
      userId: P102_PROBE_OWNER,
      provider: "notification" as const,
      actionType: "notify" as const,
      destination: "line",
      automationId: "p102_probe_auto",
      runId: sideKey,
      occurrenceKey: sideKey,
      discriminator: `${sideKey}:line`,
    };
    await executeIdempotentSideEffect(sideCtx, async () => {
      sideEffectCalls += 1;
      return {
        providerResourceId: `${sideKey}:line`,
        result: { ok: true as const },
        evidence: { smoke: true },
      };
    });
    await executeIdempotentSideEffect(sideCtx, async () => {
      sideEffectCalls += 1;
      return {
        providerResourceId: `${sideKey}:line`,
        result: { ok: true as const },
        evidence: { smoke: true },
      };
    });
    evidence.sideEffectExecuteCalls = sideEffectCalls;
    noDoubleSendOk = !stillDue && sideEffectCalls === 1;

    // 3) Max-retries → DLQ dead; must not reappear as due retry.
    const dlqId = `p102_dlq_${randomUUID().slice(0, 8)}`;
    const dlqInsert = await insertDurableNotification(
      baseRecord({
        notificationId: dlqId,
        requestId: `req_${dlqId}`,
        lineEvent: "automation_completed",
      }),
      {
        idempotencyKey: `p102:dlq:${dlqId}`,
        channel: "in_app",
        sourceType: "p102_smoke",
        sourceId: dlqId,
      },
    );
    await updateDurableDeliveryState({
      notificationId: dlqInsert.row.notificationId,
      ownerId: P102_PROBE_OWNER,
      status: "retry_scheduled",
      retryCount: 5,
      nextRetryAt: new Date(Date.now() - 1_000).toISOString(),
      pushFailureReason: "p102_smoke_force_dlq",
    });

    // Force hard delivery failure for the probe owner only. In Production,
    // LINE not_linked / push with zero subs soft-succeed and would never DLQ.
    const dlqDrain = await processDurableNotificationRetries({
      limit: 50,
      nowMs: Date.now(),
      leaseOwner: `p102_dlq_${randomUUID().slice(0, 6)}`,
      forceDeliveryFailureForOwner: P102_PROBE_OWNER,
    });
    evidence.deadLettered = dlqDrain.deadLettered;
    if (evidence.drain) {
      evidence.drain = {
        ...evidence.drain,
        dlqReinjected: evidence.drain.dlqReinjected + dlqDrain.dlqReinjected,
      };
    }

    const dlqRows = await listNotificationDlq(50);
    const deadForProbe = dlqRows.filter(
      (row) =>
        row.userId === P102_PROBE_OWNER &&
        row.notificationId === dlqInsert.row.notificationId &&
        row.status === "dead",
    );
    evidence.dlqDeadRows = deadForProbe.length;
    dlqTerminalOk = dlqDrain.deadLettered >= 1 && deadForProbe.length >= 1;

    const dueAfterDlq = await listDueDeliveryRetries({
      limit: 100,
      nowMs: Date.now() + 60_000,
    });
    const reinjected = dueAfterDlq.some(
      (row) => row.notificationId === dlqInsert.row.notificationId,
    );
    dlqNotReinjectedOk = !reinjected && dlqDrain.dlqReinjected === 0;

    const ok =
      drainOk && noDoubleSendOk && dlqTerminalOk && dlqNotReinjectedOk;

    return {
      ok,
      drainOk,
      noDoubleSendOk,
      dlqTerminalOk,
      dlqNotReinjectedOk,
      error: ok
        ? null
        : [
            !drainOk ? "drain_failed" : null,
            !noDoubleSendOk ? "double_send_guard_failed" : null,
            !dlqTerminalOk ? "dlq_terminal_failed" : null,
            !dlqNotReinjectedOk ? "dlq_reinjected" : null,
          ]
            .filter(Boolean)
            .join(","),
      evidence,
    };
  } catch (error) {
    return {
      ok: false,
      drainOk,
      noDoubleSendOk,
      dlqTerminalOk,
      dlqNotReinjectedOk,
      error: error instanceof Error ? error.message.slice(0, 240) : "smoke_failed",
      evidence,
    };
  } finally {
    try {
      await cleanupProbeArtifacts();
    } catch {
      // best-effort cleanup
    }
  }
}
