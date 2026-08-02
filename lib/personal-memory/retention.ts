import type { MemoryRetentionPolicy } from "@/lib/personal-memory/types";

export function computeExpiresAt(
  retention: MemoryRetentionPolicy,
  fromMs = Date.now(),
): string | null {
  switch (retention) {
    case "forever":
      return null;
    case "days_30":
      return new Date(fromMs + 30 * 86_400_000).toISOString();
    case "days_90":
      return new Date(fromMs + 90 * 86_400_000).toISOString();
    case "days_365":
      return new Date(fromMs + 365 * 86_400_000).toISOString();
    case "until_automation_ends":
      return null; // cleared when automation archived
    case "once":
      return new Date(fromMs + 7 * 86_400_000).toISOString();
    default:
      return null;
  }
}

export function isExpired(
  expiresAt: string | null,
  nowMs = Date.now(),
): boolean {
  if (!expiresAt) return false;
  return Date.parse(expiresAt) <= nowMs;
}

export function isStaleUnused(input: {
  lastUsedAt: string | null;
  createdAt: string;
  unusedReconfirmDays: number;
  nowMs?: number;
}): boolean {
  const now = input.nowMs ?? Date.now();
  const anchor = input.lastUsedAt ?? input.createdAt;
  const ageDays = (now - Date.parse(anchor)) / 86_400_000;
  return ageDays >= input.unusedReconfirmDays;
}
