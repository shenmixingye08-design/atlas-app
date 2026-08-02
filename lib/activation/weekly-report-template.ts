/**
 * Prefilled template for first activation: 毎週の営業レポート (Word).
 * No external integrations required.
 */

import type { CreateAutomationV2Input } from "@/lib/automation-platform/types";
import type { WeeklyReportConfig } from "@/lib/activation/types";

export const WEEKLY_REPORT_TEMPLATE_ID = "weekly_sales_report_word" as const;

export const WEEKLY_REPORT_DEFAULTS: WeeklyReportConfig = {
  name: "毎週の営業レポート",
  dayOfWeek: 1, // Monday
  hour: 9,
  minute: 0,
  contentNotes:
    "今週の商談件数、受注見込み、来週の重点顧客をまとめた週次営業報告書を作成してください。",
};

export const WEEKLY_REPORT_CONTENT_EXAMPLE =
  "例: 今週の商談は5件。A社は来週見積提出予定。来週はB社フォローを優先。";

export const DAY_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 1, label: "毎週月曜" },
  { value: 2, label: "毎週火曜" },
  { value: 3, label: "毎週水曜" },
  { value: 4, label: "毎週木曜" },
  { value: 5, label: "毎週金曜" },
] as const;

export function buildWeeklyReportCreateInput(
  config: WeeklyReportConfig,
): CreateAutomationV2Input {
  const name = config.name.trim() || WEEKLY_REPORT_DEFAULTS.name;
  const notes =
    config.contentNotes.trim() || WEEKLY_REPORT_DEFAULTS.contentNotes;

  return {
    name,
    description: "毎週の営業活動をWord報告書にまとめます",
    status: "active",
    instruction: {
      freeformNotes: notes,
      structuredOptions: {
        generateWord: true,
        generatePdf: true,
      },
    },
    trigger: {
      type: "schedule",
      timezone: "Asia/Tokyo",
      schedule: {
        frequency: "weekly",
        hour: config.hour,
        minute: config.minute,
        daysOfWeek: [config.dayOfWeek],
      },
      event: null,
      condition: null,
    },
    workflow: {
      version: 1,
      steps: [
        {
          id: "activation_word_1",
          type: "word_generate",
          name: "週次営業報告書",
          order: 1,
          inputBindings: {},
          configuration: {
            title: name,
            documentType: "report",
            tone: "formal",
          },
          requiresApproval: false,
          retryPolicy: { maxAttempts: 2, backoffMs: [1000] },
          timeoutMs: 120_000,
          onSuccess: null,
          onFailure: null,
          enabled: true,
        },
      ],
      onFailure: { strategy: "stop", notify: true },
      timeoutPolicy: {
        workflowTimeoutMs: 180_000,
        stepDefaultTimeoutMs: 120_000,
      },
    },
    executionPolicy: { mode: "run_then_notify" },
    notificationPolicy: {
      beforeRun: false,
      onSuccess: true,
      onFailure: true,
      onNeedsInput: true,
      channels: ["in_app"],
    },
    rejectOnConflict: false,
  };
}

export function isActivationWeeklyReportEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ATLAS_ACTIVATION_WEEKLY_REPORT?.trim()
    .toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  // Server-side companion
  const server = process.env.ATLAS_ACTIVATION_WEEKLY_REPORT?.trim().toLowerCase();
  if (server === "false" || server === "0" || server === "off") return false;
  return true;
}
