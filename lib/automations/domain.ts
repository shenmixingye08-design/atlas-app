import { computeNextRunIso, presetToCron } from "./schedule";
import { DEFAULT_AUTOMATION_TIMING } from "./timing-defaults";
import { normalizeExecutionLevel } from "./execution-level";
import { normalizeExecutionMode } from "@/lib/cost-optimization/execution-mode";
import { normalizeSnsBatchDays } from "@/lib/cost-optimization/sns-batch";
import {
  createDefaultExecutionFlow,
  inferWorkflowTemplate,
  normalizeExecutionFlow,
} from "./execution-flow";
import {
  buildXDestinationExecutionFlow,
  normalizeAutomationDestination,
} from "./x-recurring/destination";
import type {
  Automation,
  AutomationDestination,
  AutomationExecutionLevel,
  AutomationExecutionMode,
  AutomationSchedule,
  CreateAutomationInput,
  SchedulePreset,
  SnsBatchDays,
  WorkExecutionFlow,
} from "./types";

const TZ = "Asia/Tokyo";

function buildSchedule(
  preset: SchedulePreset,
  label: string,
): AutomationSchedule {
  return {
    kind: "schedule",
    preset,
    cron: presetToCron(preset),
    timezone: TZ,
    label,
  };
}

function seedAutomation(
  id: string,
  name: string,
  description: string,
  schedule: AutomationSchedule,
  assignment: string,
  executionLevel: AutomationExecutionLevel,
  executionMode: AutomationExecutionMode = "eco",
  snsBatchDays: SnsBatchDays | null = null,
  executionFlow?: WorkExecutionFlow,
  destination: AutomationDestination = "none",
): Automation {
  const now = "2026-01-01T00:00:00.000Z";
  const level = normalizeExecutionLevel(executionLevel);
  const flow =
    executionFlow ??
    (destination === "x"
      ? buildXDestinationExecutionFlow(level)
      : createDefaultExecutionFlow(inferWorkflowTemplate(`${name} ${assignment}`)));
  return {
    id,
    userId: null,
    name,
    description,
    schedule,
    workflow: { assignment },
    timing: DEFAULT_AUTOMATION_TIMING,
    executionLevel: level,
    executionMode,
    snsBatchDays,
    executionFlow: normalizeExecutionFlow(flow),
    destination,
    enabled: true,
    lastRun: null,
    nextRun: computeNextRunIso(schedule),
    status: "idle",
    lastWorkflowRunId: null,
    lastError: null,
    successCount: 0,
    failureCount: 0,
    runHistory: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Default habit automations shown on first load. */
export const SEED_AUTOMATIONS: Automation[] = [
  seedAutomation(
    "habit-x-post",
    "SNS投稿",
    "毎日18時にXへ投稿する文案を作成します。",
    buildSchedule({ type: "daily", hour: 18, minute: 0 }, "毎日 18:00"),
    "X（Twitter）に投稿する文章を作成してください。トーンはプロフェッショナルかつ親しみやすく、140字前後でお願いします。",
    "full_auto",
    "eco",
    7,
    undefined,
    "x",
  ),
  seedAutomation(
    "habit-blog",
    "ブログ作成",
    "毎週月曜にブログ記事の下書きを生成します。",
    buildSchedule({ type: "weekly", dayOfWeek: 1, hour: 9, minute: 0 }, "毎週月曜 9:00"),
    "ブログ記事の下書きを作成してください。見出し構成、本文、メタディスクリプション案を含めてください。",
    "approve_then_run",
    "eco",
  ),
  seedAutomation(
    "habit-coconala",
    "ココナラ更新",
    "毎週水曜にココナラ募集文を更新します。",
    buildSchedule({ type: "weekly", dayOfWeek: 3, hour: 10, minute: 0 }, "毎週水曜 10:00"),
    "ココナラ用のサービス募集文を作成してください。サービスの強み、提供内容、納期、価格帯の目安を含めてください。",
    "full_auto",
  ),
  seedAutomation(
    "habit-sales-deck",
    "営業資料",
    "毎月1日に営業資料のたたき台を作成します。",
    buildSchedule({ type: "monthly", dayOfMonth: 1, hour: 9, minute: 0 }, "毎月1日 9:00"),
    "営業資料を作成してください。目的、想定ターゲット、提案内容、実績、次のステップを含む構成案と本文を作成してください。",
    "suggest_only",
    "standard",
  ),
  seedAutomation(
    "habit-email-check",
    "メール確認",
    "毎朝、確認すべきメールの要点を整理します。",
    buildSchedule({ type: "daily", hour: 8, minute: 30 }, "毎日 8:30"),
    "本日確認すべきメールの観点を整理してください。優先度の高い返信候補、フォローアップが必要な案件、期限のあるタスクをリストアップしてください。",
    "approve_then_run",
    "high_quality",
  ),
  seedAutomation(
    "habit-file-organize",
    "ファイル整理",
    "毎週金曜にファイル整理の提案を作成します。",
    buildSchedule({ type: "weekly", dayOfWeek: 5, hour: 17, minute: 0 }, "毎週金曜 17:00"),
    "Google Drive内のマーケティング資料フォルダを整理する計画を作成してください。フォルダ構成案、命名規則、移動・削除候補を提案してください。",
    "draft_save",
  ),
];

export function createAutomationFromInput(input: CreateAutomationInput): Automation {
  const now = new Date();
  const nowIso = now.toISOString();
  const timing = input.timing ?? DEFAULT_AUTOMATION_TIMING;
  const normalizedTiming = {
    startDate: timing.startDate,
    endCondition:
      timing.endCondition.type === "occurrence_count"
        ? {
            ...timing.endCondition,
            completedOccurrences: timing.endCondition.completedOccurrences ?? 0,
          }
        : timing.endCondition,
  };

  const schedule =
    input.schedule.kind === "schedule" && !input.schedule.cron
      ? {
          ...input.schedule,
          cron: presetToCron(input.schedule.preset),
        }
      : input.schedule;

  const nextRunFrom =
    normalizedTiming.startDate &&
    new Date(normalizedTiming.startDate).getTime() > now.getTime()
      ? new Date(normalizedTiming.startDate)
      : now;

  const destination = normalizeAutomationDestination(input.destination);
  const executionLevel = normalizeExecutionLevel(input.executionLevel);
  const executionFlow = normalizeExecutionFlow(
    input.executionFlow ??
      (destination === "x"
        ? buildXDestinationExecutionFlow(executionLevel)
        : createDefaultExecutionFlow(
            inferWorkflowTemplate(
              `${input.name} ${input.workflow.assignment}`,
            ),
          )),
  );

  return {
    id: crypto.randomUUID(),
    userId: input.userId ?? null,
    name: input.name.trim(),
    description: input.description.trim(),
    schedule,
    workflow: input.workflow,
    timing: normalizedTiming,
    executionLevel,
    executionMode: normalizeExecutionMode(input.executionMode),
    snsBatchDays: normalizeSnsBatchDays(input.snsBatchDays),
    executionFlow,
    destination,
    enabled: input.enabled ?? true,
    lastRun: null,
    nextRun: computeNextRunIso(schedule, nextRunFrom),
    status: "idle",
    lastWorkflowRunId: null,
    lastError: null,
    successCount: 0,
    failureCount: 0,
    runHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function previewFinalResponse(text: string, maxLength = 240): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}
