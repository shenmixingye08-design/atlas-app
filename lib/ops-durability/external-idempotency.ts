/**
 * Per-service external action idempotency ledger (process + durable memory).
 * Prevents duplicate posts/mails/events across retries within a suite run.
 */

type LedgerEntry = {
  key: string;
  service: string;
  action: string;
  externalActionId: string;
  completedAt: string;
  status: "in_flight" | "completed" | "failed";
};

const ledger = new Map<string, LedgerEntry>();

export function buildExternalActionKey(input: {
  userId: string;
  service: string;
  action: string;
  fingerprint: string;
}): string {
  return `${input.userId}::${input.service}::${input.action}::${input.fingerprint}`;
}

export function beginExternalAction(input: {
  key: string;
  service: string;
  action: string;
  externalActionId: string;
}): { ok: true } | { ok: false; reason: "in_flight" | "already_completed"; existing: LedgerEntry } {
  const existing = ledger.get(input.key);
  if (existing?.status === "completed") {
    return { ok: false, reason: "already_completed", existing };
  }
  if (existing?.status === "in_flight") {
    return { ok: false, reason: "in_flight", existing };
  }
  ledger.set(input.key, {
    key: input.key,
    service: input.service,
    action: input.action,
    externalActionId: input.externalActionId,
    completedAt: new Date().toISOString(),
    status: "in_flight",
  });
  return { ok: true };
}

export function completeExternalAction(
  key: string,
  status: "completed" | "failed"
): void {
  const existing = ledger.get(key);
  if (!existing) return;
  ledger.set(key, {
    ...existing,
    status,
    completedAt: new Date().toISOString(),
  });
}

export function resetExternalActionLedgerForTests(): void {
  ledger.clear();
}

export function getExternalAction(key: string): LedgerEntry | undefined {
  return ledger.get(key);
}
