"use client";

import type { Deliverable, DeliverableFormat } from "./types";

const STORAGE_KEY = "atlas-deliverable-file-history";
const MAX_ENTRIES = 80;

export type DeliverableHistoryEntry = {
  projectId: string;
  assignment: string;
  title: string;
  contentHash: string;
  formats: DeliverableFormat[];
  files: Array<{
    format: DeliverableFormat;
    fileName: string;
    downloadUrl: string;
    generatedAt: string;
    sizeBytes: number;
  }>;
  updatedAt: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): DeliverableHistoryEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DeliverableHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: DeliverableHistoryEntry[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_ENTRIES)),
    );
  } catch {
    // Ignore quota errors — history is best-effort.
  }
}

export function listDeliverableHistory(): DeliverableHistoryEntry[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getDeliverableHistory(
  projectId: string,
): DeliverableHistoryEntry | null {
  return readAll().find((entry) => entry.projectId === projectId) ?? null;
}

export function saveDeliverableHistory(input: {
  projectId: string;
  assignment: string;
  title: string;
  contentHash: string;
  deliverables: readonly Deliverable[];
}): DeliverableHistoryEntry {
  const entry: DeliverableHistoryEntry = {
    projectId: input.projectId,
    assignment: input.assignment,
    title: input.title,
    contentHash: input.contentHash,
    formats: input.deliverables.map((item) => item.format),
    files: input.deliverables.map((item) => ({
      format: item.format,
      fileName: item.fileName,
      downloadUrl: item.downloadUrl,
      generatedAt: item.generatedAt,
      sizeBytes: item.sizeBytes,
    })),
    updatedAt: new Date().toISOString(),
  };

  const rest = readAll().filter((item) => item.projectId !== input.projectId);
  writeAll([entry, ...rest]);
  return entry;
}

/** Lightweight client hash for matching regenerated content. */
export function hashDeliverableText(content: string): string {
  let hash = 0;
  const text = content.trim();
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}
