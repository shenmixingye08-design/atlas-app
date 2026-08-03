import { createHash, randomUUID } from "node:crypto";

export function newSchedulerTickId(): string {
  return `stk_${randomUUID().replace(/-/g, "")}`;
}

export function newSchedulerRequestId(): string {
  return `sreq_${randomUUID().replace(/-/g, "")}`;
}

export function newSchedulerDiagnosticId(prefix = "tick"): string {
  const stamp = Date.now().toString(36);
  const rand = createHash("sha256")
    .update(`${prefix}:${stamp}:${Math.random()}`)
    .digest("hex")
    .slice(0, 10);
  return `sdiag_${prefix}_${stamp}_${rand}`;
}

export function newOutboxId(): string {
  return `sout_${randomUUID().replace(/-/g, "")}`;
}
