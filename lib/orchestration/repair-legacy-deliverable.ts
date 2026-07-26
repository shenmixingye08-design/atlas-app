/**
 * Safe repair helpers for legacy deliverables that stored internal JSON
 * in user-facing fields. Never performs bulk destructive updates.
 */

import type { Deliverable } from "./deliverable-types";
import {
  assertSafeDeliverableForPersistence,
  logDeliverableNormalizeDebug,
  normalizeDeliverablePayload,
  type NormalizeDeliverableResult,
} from "./normalize-deliverable-payload";

export type RepairLegacyDeliverableResult =
  | {
      ok: true;
      deliverable: Deliverable;
      repaired: boolean;
      dryRun: boolean;
    }
  | {
      ok: false;
      dryRun: boolean;
      safeMessage: string;
      errorCode: string;
    };

/**
 * Attempt to repair one legacy deliverable.
 * When dryRun=true, returns the repaired shape without implying persistence.
 */
export function repairLegacyDeliverable(
  raw: unknown,
  options: { dryRun?: boolean; assignment?: string } = {},
): RepairLegacyDeliverableResult {
  const dryRun = options.dryRun ?? true;
  const normalized: NormalizeDeliverableResult = normalizeDeliverablePayload(raw, {
    assignment: options.assignment,
  });

  if (!normalized.ok) {
    logDeliverableNormalizeDebug({
      stage: "repairLegacyDeliverable",
      parseSucceeded: false,
      rejectedReason: normalized.errorCode,
    });
    return {
      ok: false,
      dryRun,
      safeMessage: normalized.safeMessage,
      errorCode: normalized.errorCode,
    };
  }

  const persist = assertSafeDeliverableForPersistence(normalized.deliverable, {
    assignment: options.assignment,
  });
  if (!persist.ok) {
    return {
      ok: false,
      dryRun,
      safeMessage: persist.safeMessage,
      errorCode: persist.rejectedReason,
    };
  }

  logDeliverableNormalizeDebug({
    stage: "repairLegacyDeliverable",
    parseSucceeded: true,
    validationSucceeded: true,
    repairedLegacyData: normalized.repairedLegacyData,
    deliverableType: persist.deliverable.type,
  });

  return {
    ok: true,
    deliverable: persist.deliverable,
    repaired: normalized.repairedLegacyData,
    dryRun,
  };
}
