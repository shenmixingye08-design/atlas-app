/**
 * P1-07 safe failure injection.
 * Mutates ONLY atlas_monitor_injections (synthetic overlay).
 * Never touches user automations / notifications / side-effect jobs.
 */

import "server-only";

import {
  clearInjection,
  clearInjectionsByKind,
  createInjection,
  listActiveInjections,
} from "./store";
import type { InjectionKind, MonitorInjection } from "./types";

export const P107_INJECTION_KINDS: InjectionKind[] = [
  "tick_failure",
  "worker_stale",
  "dlq_spike",
  "notification_failure",
  "side_effect_failure",
];

export function isInjectionKind(value: string): value is InjectionKind {
  return (P107_INJECTION_KINDS as string[]).includes(value);
}

export async function activateFailureInjection(input: {
  kind: InjectionKind;
  ttlMs?: number;
  createdBy?: string;
}): Promise<MonitorInjection> {
  // Replace prior active injection of same kind (isolated).
  await clearInjectionsByKind(input.kind);
  return createInjection({
    kind: input.kind,
    ttlMs: input.ttlMs ?? 10 * 60_000,
    createdBy: input.createdBy ?? "p1-07",
    metadata: { synthetic: true, safe: true },
  });
}

export async function deactivateFailureInjection(input: {
  kind?: InjectionKind;
  injectionId?: string;
}): Promise<{ cleared: number }> {
  if (input.injectionId) {
    await clearInjection(input.injectionId);
    return { cleared: 1 };
  }
  if (input.kind) {
    const n = await clearInjectionsByKind(input.kind);
    return { cleared: n };
  }
  const active = await listActiveInjections();
  for (const inj of active) await clearInjection(inj.id);
  return { cleared: active.length };
}

export async function listFailureInjections(): Promise<MonitorInjection[]> {
  return listActiveInjections();
}
