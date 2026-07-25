"use client";

const KEY = "atlas.pendingAttachmentIds";

export function stashPendingAttachmentIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  if (ids.length === 0) {
    window.sessionStorage.removeItem(KEY);
    return;
  }
  window.sessionStorage.setItem(KEY, JSON.stringify(ids));
}

export function consumePendingAttachmentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  } catch {
    return [];
  }
}
