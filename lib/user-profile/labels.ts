import { getExecutionLevelShortLabel } from "@/lib/automations/execution-level";

import type { DeliverableFormatPreference, JobLearnedSettings } from "./types";

const FORMAT_LABELS: Record<DeliverableFormatPreference, string> = {
  pptx: "PowerPointのみ",
  pdf: "PDFのみ",
  docx: "Wordのみ",
  xlsx: "Excelのみ",
  md: "Markdown",
  txt: "テキスト",
  pptx_pdf: "PowerPoint + PDF",
  docx_pdf: "Word + PDF",
};

export function formatDeliverablePreference(
  format: DeliverableFormatPreference | undefined,
): string | null {
  if (!format) return null;
  return FORMAT_LABELS[format] ?? format;
}

export function formatPostingTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Human-readable summary of learned settings for a job. */
export function formatLearnedSettingSummary(
  settings: JobLearnedSettings | undefined | null,
): string {
  if (!settings) return "設定を学習中";

  const parts: string[] = [];

  if (settings.preferredFormat) {
    parts.push(formatDeliverablePreference(settings.preferredFormat)!);
  }

  if (settings.executionLevel) {
    parts.push(getExecutionLevelShortLabel(settings.executionLevel));
  }

  if (settings.preferredHour !== undefined) {
    const minute = settings.preferredMinute ?? 0;
    parts.push(`${formatPostingTime(settings.preferredHour, minute)}`);
  }

  if (settings.frequency === "weekly") {
    parts.push("毎週");
  } else if (settings.frequency === "daily") {
    parts.push("毎日");
  } else if (settings.frequency === "monthly") {
    parts.push("毎月");
  }

  return parts.length > 0 ? parts.join(" · ") : "設定を学習中";
}
