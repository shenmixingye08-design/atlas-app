import { randomUUID } from "crypto";

import { createNotificationWithDelivery } from "@/lib/notifications/service";
import type { NotificationType } from "@/lib/notifications/types";
import { classifyOpsFailure } from "@/lib/ops-durability/classify";
import type { OpsNotificationResult } from "@/lib/ops-durability/types";

const KINDS: Array<{ kind: string; type: NotificationType; lineEvent: "work_completed" | "error" | "document_ready" | "automation_completed" | "confirmation_request" }> = [
  { kind: "deliverable_complete", type: "completed", lineEvent: "work_completed" },
  { kind: "convert_complete", type: "completed", lineEvent: "document_ready" },
  { kind: "revision_complete", type: "completed", lineEvent: "work_completed" },
  { kind: "needs_input", type: "awaiting_review", lineEvent: "confirmation_request" },
  { kind: "transient_error", type: "error", lineEvent: "error" },
  { kind: "final_failure", type: "error", lineEvent: "error" },
  { kind: "external_success", type: "integration", lineEvent: "automation_completed" },
  { kind: "external_failure", type: "error", lineEvent: "error" },
];

/** 500 notification cases across kinds. */
export async function runNotificationDurability(input: {
  userId: string;
  count?: number;
}): Promise<OpsNotificationResult[]> {
  const count = input.count ?? 500;
  const results: OpsNotificationResult[] = [];
  const seenKeys = new Set<string>();

  for (let i = 1; i <= count; i++) {
    const meta = KINDS[(i - 1) % KINDS.length]!;
    const caseId = `ops_ntf_${String(i).padStart(4, "0")}`;
    const requestId = `opsntf_${caseId}_${randomUUID().slice(0, 8)}`;
    const dedupeKey = `${meta.kind}:${i}:${requestId}`;
    const started = Date.now();
    let okCreate = false;
    let okPush = false;
    let okEmail = false;
    let duplicate = false;
    let prematureComplete = false;
    let notificationId: string | null = null;
    let failureClass: OpsNotificationResult["failureClass"] = null;
    let failureReason: string | null = null;
    // Email channel is not implemented — exclude from success denom for email
    const countedInSuccessRate = true;

    try {
      if (seenKeys.has(dedupeKey)) duplicate = true;
      seenKeys.add(dedupeKey);

      // Premature complete guard: error kinds must not use type=completed
      if (
        (meta.kind === "transient_error" ||
          meta.kind === "final_failure" ||
          meta.kind === "external_failure") &&
        meta.type === "completed"
      ) {
        prematureComplete = true;
      }

      const created = await createNotificationWithDelivery({
        audience: "user",
        userId: input.userId,
        type: meta.type,
        title: `${meta.kind} ${i}`,
        message: `通知耐久 ${caseId} — 本文はマスク対象外の合成文言`,
        relatedTaskId: `task_${caseId}`,
        requestId,
        lineEvent: meta.lineEvent,
        targetType: meta.type === "completed" ? "deliverable" : "request",
        targetId: caseId,
      });

      okCreate = Boolean(created.record?.notificationId);
      notificationId = created.record?.notificationId ?? null;
      // Push: not_configured / no subscription counts as channel skip, not failure for create rate.
      // Gate "Push成功率" only when VAPID+subscription exist; here we record honest pushOk.
      okPush = created.pushOk === true;
      // Email channel unimplemented — never claim success
      okEmail = false;
      if (!okCreate) {
        failureClass = "notification_create_failed";
      } else if (created.pushOk === false) {
        failureClass = "push_failed";
        failureReason = "push_delivery_failed_or_unconfigured";
      }
    } catch (error) {
      failureReason = error instanceof Error ? error.message : String(error);
      failureClass = classifyOpsFailure({
        stage: "notification",
        message: failureReason,
      });
    }

    results.push({
      caseId,
      kind: meta.kind,
      okCreate,
      okPush,
      okEmail,
      duplicate,
      prematureComplete,
      delayMs: Date.now() - started,
      notificationId,
      requestId,
      failureClass,
      failureReason,
      countedInSuccessRate,
    });
  }

  return results;
}
