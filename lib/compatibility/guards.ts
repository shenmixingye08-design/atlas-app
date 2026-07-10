/**
 * Shared runtime guards for legacy / partial persisted records.
 * Use before map, filter, slice, and property access on external data.
 */

export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asNonEmptyString(value: unknown, fallback: string): string {
  const text = asString(value, fallback).trim();
  return text.length > 0 ? text : fallback;
}

export function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function asStringArray(value: unknown): string[] {
  return asArray<unknown>(value).filter((item): item is string => typeof item === "string");
}

/** Safe string slice for unknown values. */
export function safeSlice(value: unknown, start: number, end?: number): string {
  return asString(value).slice(start, end);
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseTimestamp(value: unknown): number {
  const iso = asOptionalString(value);
  if (!iso?.trim()) return Number.NaN;
  return Date.parse(iso);
}

export function asIsoTimestamp(value: unknown, fallback: string): string {
  const iso = asOptionalString(value);
  if (!iso || Number.isNaN(Date.parse(iso))) return fallback;
  return iso;
}

export function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const candidate = asString(value);
  return (allowed as readonly string[]).includes(candidate) ? (candidate as T) : fallback;
}
