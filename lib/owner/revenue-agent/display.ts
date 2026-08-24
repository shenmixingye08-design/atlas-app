import type { MeasuredNumber } from "./types";

/** 未取得は 0 にしない。 */
export function displayMeasured(value: MeasuredNumber | undefined): string {
  return value == null ? "—" : String(value);
}

export function displayYen(value: MeasuredNumber | undefined): string {
  if (value == null) return "—";
  return `${value.toLocaleString("ja-JP")}円`;
}

export function displayUsd(value: MeasuredNumber | undefined): string {
  if (value == null) return "—";
  return `$${value.toFixed(4)}`;
}

export function displayRate(value: MeasuredNumber | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function safeRate(
  numerator: MeasuredNumber,
  denominator: MeasuredNumber,
): MeasuredNumber {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return numerator / denominator;
}
