import { randomUUID } from "crypto";

import type { MonitoringIncident } from "./types";

type CronTickState = {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

type MonitoringBucket = {
  incidents: MonitoringIncident[];
  cron: CronTickState;
};

function getBucket(): MonitoringBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasMonitoringStore?: MonitoringBucket;
  };
  if (!globalScope.__atlasMonitoringStore) {
    globalScope.__atlasMonitoringStore = {
      incidents: [],
      cron: {
        lastSuccessAt: null,
        lastFailureAt: null,
        lastError: null,
      },
    };
  }
  return globalScope.__atlasMonitoringStore;
}

export function appendMonitoringIncident(
  input: Omit<MonitoringIncident, "id">,
): MonitoringIncident {
  const incident: MonitoringIncident = {
    id: `inc_${randomUUID()}`,
    ...input,
  };
  const bucket = getBucket();
  bucket.incidents.unshift(incident);
  if (bucket.incidents.length > 500) {
    bucket.incidents.length = 500;
  }
  void import("./durable")
    .then((mod) => mod.schedulePersistMonitoring())
    .catch(() => undefined);
  return incident;
}

export function listMonitoringIncidents(): MonitoringIncident[] {
  return [...getBucket().incidents];
}

export function recordCronTickSuccess(at = new Date().toISOString()): void {
  const cron = getBucket().cron;
  cron.lastSuccessAt = at;
  cron.lastError = null;
  void import("./durable")
    .then((mod) => mod.schedulePersistMonitoring())
    .catch(() => undefined);
}

export function recordCronTickFailure(
  message: string,
  at = new Date().toISOString(),
): void {
  const cron = getBucket().cron;
  cron.lastFailureAt = at;
  cron.lastError = message.slice(0, 500);
  void import("./durable")
    .then((mod) => mod.schedulePersistMonitoring())
    .catch(() => undefined);
}

export function getCronTickState(): CronTickState {
  return { ...getBucket().cron };
}

export function replaceMonitoringState(input: {
  incidents: MonitoringIncident[];
  cron: CronTickState;
}): void {
  const bucket = getBucket();
  bucket.incidents = [...input.incidents].slice(0, 500);
  bucket.cron = { ...input.cron };
}

export function resetMonitoringStoreForTests(): void {
  const bucket = getBucket();
  bucket.incidents = [];
  bucket.cron = {
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  };
}
