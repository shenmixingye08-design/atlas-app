"use client";

import type { BackupHistoryEntry } from "./types";

const STORAGE_KEY = "atlas-backup-history";
const MAX_ENTRIES = 50;

function readEntries(): BackupHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BackupHistoryEntry[];
  } catch {
    return [];
  }
}

function writeEntries(entries: BackupHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function listBackupHistory(): BackupHistoryEntry[] {
  return readEntries().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function addBackupHistoryEntry(entry: BackupHistoryEntry): BackupHistoryEntry {
  writeEntries([entry, ...readEntries()]);
  return entry;
}

export function deleteBackupHistoryEntry(id: string): void {
  writeEntries(readEntries().filter((entry) => entry.id !== id));
}

export function clearBackupHistory(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function formatBackupSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
