import type { AuditLogEntry, AuditLogSettings, AuditRetentionDays } from "./types";

const DEFAULT_SETTINGS: AuditLogSettings = {
  retentionDays: 90,
  updatedAt: null,
};

type AuditBucket = {
  entries: AuditLogEntry[];
  settings: AuditLogSettings;
  hydrated: boolean;
};

function getBucket(): AuditBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAuditLogStore?: AuditBucket;
  };

  if (!globalScope.__atlasAuditLogStore) {
    globalScope.__atlasAuditLogStore = {
      entries: [],
      settings: { ...DEFAULT_SETTINGS },
      hydrated: false,
    };
  }

  return globalScope.__atlasAuditLogStore;
}

export function getAuditLogSettings(): AuditLogSettings {
  return { ...getBucket().settings };
}

export function setAuditLogSettings(
  retentionDays: AuditRetentionDays,
  updatedAt: string = new Date().toISOString(),
): AuditLogSettings {
  const bucket = getBucket();
  bucket.settings = { retentionDays, updatedAt };
  return { ...bucket.settings };
}

export function isAuditLogHydrated(): boolean {
  return getBucket().hydrated;
}

export function markAuditLogHydrated(): void {
  getBucket().hydrated = true;
}

export function replaceAuditLogEntries(entries: AuditLogEntry[]): void {
  const bucket = getBucket();
  bucket.entries = [...entries];
  bucket.hydrated = true;
}

export function prependAuditLogEntry(entry: AuditLogEntry, maxEntries = 5000): AuditLogEntry {
  const bucket = getBucket();
  bucket.entries.unshift(entry);
  if (bucket.entries.length > maxEntries) {
    bucket.entries.length = maxEntries;
  }
  return entry;
}

export function listAuditLogEntries(): AuditLogEntry[] {
  return [...getBucket().entries];
}

export function pruneAuditLogEntries(cutoffIso: string): number {
  const bucket = getBucket();
  const before = bucket.entries.length;
  const cutoff = new Date(cutoffIso).getTime();
  bucket.entries = bucket.entries.filter((row) => {
    const at = new Date(row.at).getTime();
    return Number.isFinite(at) ? at >= cutoff : true;
  });
  return before - bucket.entries.length;
}

export function resetAuditLogStoreForTests(): void {
  const bucket = getBucket();
  bucket.entries = [];
  bucket.settings = { ...DEFAULT_SETTINGS };
  bucket.hydrated = false;
}
