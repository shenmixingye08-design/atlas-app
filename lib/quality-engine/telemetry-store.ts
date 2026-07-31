import "server-only";

import type { QualityEngineTelemetry } from "./types";

export type QualityEngineLogEntry = QualityEngineTelemetry & {
  userId: string | null;
  assignmentHint: string;
};

type Bucket = QualityEngineLogEntry[];

function getBucket(): Bucket {
  const scope = globalThis as typeof globalThis & {
    __atlasQualityEngineLogs?: Bucket;
  };
  if (!scope.__atlasQualityEngineLogs) {
    scope.__atlasQualityEngineLogs = [];
  }
  return scope.__atlasQualityEngineLogs;
}

/** Owner-only: store stage timings, improve count, quality score. */
export function recordQualityEngineTelemetry(
  entry: QualityEngineLogEntry,
): void {
  getBucket().unshift(entry);
  if (getBucket().length > 500) {
    getBucket().length = 500;
  }
}

export function listQualityEngineTelemetry(limit = 100): QualityEngineLogEntry[] {
  return getBucket().slice(0, Math.max(1, Math.min(limit, 500)));
}

export function resetQualityEngineTelemetryForTests(): void {
  getBucket().length = 0;
}
