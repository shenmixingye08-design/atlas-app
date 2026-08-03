import "server-only";

import { isEphemeralServerlessFs } from "@/lib/runtime/ephemeral-fs";
import { isAtlasProduction } from "@/lib/runtime/is-production";

export type DangerousFallbackKind =
  | "work_queue_file"
  | "memory_only_store"
  | "local_object_storage";

export type DangerousFallbackEvent = {
  kind: DangerousFallbackKind;
  message: string;
  at: string;
  production: boolean;
  ephemeralFs: boolean;
};

type GlobalDiag = typeof globalThis & {
  __atlasDurableSotDiagnostics?: DangerousFallbackEvent[];
};

function bucket(): DangerousFallbackEvent[] {
  const g = globalThis as GlobalDiag;
  if (!g.__atlasDurableSotDiagnostics) {
    g.__atlasDurableSotDiagnostics = [];
  }
  return g.__atlasDurableSotDiagnostics;
}

/** Test helper — clears in-process diagnostic buffer. */
export function resetDurableSotDiagnosticsForTests(): void {
  const g = globalThis as GlobalDiag;
  g.__atlasDurableSotDiagnostics = [];
}

export function listDurableSotDiagnostics(): DangerousFallbackEvent[] {
  return [...bucket()];
}

/**
 * Record + log a dangerous non-durable fallback.
 * In production or ephemeral FS, throws (fail-fast) unless soft=true.
 */
export function reportDangerousFallback(input: {
  kind: DangerousFallbackKind;
  message: string;
  soft?: boolean;
}): DangerousFallbackEvent {
  const event: DangerousFallbackEvent = {
    kind: input.kind,
    message: input.message,
    at: new Date().toISOString(),
    production: isAtlasProduction(),
    ephemeralFs: isEphemeralServerlessFs(),
  };
  bucket().push(event);
  const line = `[durable-sot-audit] ${event.kind}: ${event.message}`;
  if (event.production || event.ephemeralFs) {
    console.error(line);
    if (!input.soft) {
      throw new Error(line);
    }
  } else {
    console.warn(line);
  }
  return event;
}

/**
 * Work Queue must not use file store as production SoT.
 * Call only when selecting file backend outside explicit test force-file
 * (caller is responsible for skipping under ATLAS_WORK_QUEUE_FORCE_FILE / Vitest).
 */
export function assertWorkQueueFileFallbackAllowed(reason: string): void {
  reportDangerousFallback({
    kind: "work_queue_file",
    message: `Work Queue file fallback refused (${reason}). Postgres DATABASE_URL is required for durable SoT.`,
  });
}
