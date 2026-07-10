import type { LearningEvent, LearningReport } from "./types";

type EventBucket = LearningEvent[];
type ReportBucket = LearningReport[];

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    __atlasLearningEventStore?: Map<string, EventBucket>;
    __atlasLearningReportStore?: Map<string, ReportBucket>;
  };
}

function getEventBucket(userId: string): EventBucket {
  const scope = getGlobalScope();
  if (!scope.__atlasLearningEventStore) {
    scope.__atlasLearningEventStore = new Map();
  }
  const bucket = scope.__atlasLearningEventStore.get(userId);
  if (!bucket) {
    scope.__atlasLearningEventStore.set(userId, []);
    return scope.__atlasLearningEventStore.get(userId)!;
  }
  return bucket;
}

function getReportBucket(userId: string): ReportBucket {
  const scope = getGlobalScope();
  if (!scope.__atlasLearningReportStore) {
    scope.__atlasLearningReportStore = new Map();
  }
  const bucket = scope.__atlasLearningReportStore.get(userId);
  if (!bucket) {
    scope.__atlasLearningReportStore.set(userId, []);
    return scope.__atlasLearningReportStore.get(userId)!;
  }
  return bucket;
}

export function appendLearningEvent(
  userId: string,
  event: LearningEvent,
): LearningEvent {
  const bucket = getEventBucket(userId);
  bucket.unshift(event);
  if (bucket.length > 500) bucket.length = 500;
  return event;
}

export function listLearningEvents(userId: string): LearningEvent[] {
  return [...getEventBucket(userId)].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function listLearningEventsInRange(
  userId: string,
  startIso: string,
  endIso: string,
): LearningEvent[] {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return listLearningEvents(userId).filter((event) => {
    const ts = new Date(event.createdAt).getTime();
    return ts >= start && ts <= end;
  });
}

export function appendLearningReport(
  userId: string,
  report: LearningReport,
): LearningReport {
  const bucket = getReportBucket(userId);
  bucket.unshift(report);
  if (bucket.length > 20) bucket.length = 20;
  return report;
}

export function listLearningReports(userId: string): LearningReport[] {
  return [...getReportBucket(userId)].sort(
    (a, b) =>
      new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
  );
}

export function findLatestLearningReport(
  userId: string,
  periodDays: number,
): LearningReport | null {
  return (
    listLearningReports(userId).find((report) => report.periodDays === periodDays) ??
    null
  );
}

export function resetLearningStores(userId: string): void {
  getEventBucket(userId).length = 0;
  getReportBucket(userId).length = 0;
}
