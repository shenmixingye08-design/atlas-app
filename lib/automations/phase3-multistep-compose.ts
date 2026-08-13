/**
 * Phase 3 — compose practical multi-step Production workflows from NL.
 *
 * 【ATLAS機能評価】
 * 機能名：Automation Phase 3 Multi-step Completion
 * ユーザー価値：複数手順の仕事を途中停止なく完遂し、手作業のつなぎ作業を削減
 * 差別化：単一外部操作ではなく generate→外部→通知まで durable evidence 付きで完走
 * 繰り返し作業の削減：はい
 * AI必要度：不要（ルールベース組み立て）
 * AIなしで実装可能：はい
 * 運営コスト：追加AIなし
 * 外部APIコスト：有（承認後・実行時のみ）
 * コスト削減案：エコN/A / side-effect claim / 予約実行 / AIなし /
 *   外部API最小化 / 承認後実行 / 成功step再実行禁止
 * 優先度：P0
 */

import {
  extractCalendarEventTitle,
  type RequiredExternalAction,
} from "@/lib/automations/detect-external-intent";
import { buildGoogleCalendarStepFromText } from "@/lib/automations/ensure-external-steps";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";

const GENERATE_PATTERN =
  /文章を作成|資料を作成|文書を作成|報告書|提案書|テキストを作成|という文章|ドキュメント作成|成果物を生成|文章生成/i;
const NOTIFY_PATTERN = /通知|知らせ|完了したら通知|完了通知/i;
const GMAIL_PATTERN =
  /gmail|ジーメール|(?:メール|mail).*(?:送信|送って|下書き)|(?:送って|送信して|下書き).*(?:メール|mail)/i;
const DROPBOX_PATTERN = /dropbox|ドロップボックス/;

function baseStep(
  partial: Pick<AutomationWorkflowStep, "id" | "type" | "name" | "order"> &
    Partial<AutomationWorkflowStep>,
): AutomationWorkflowStep {
  return {
    id: partial.id,
    type: partial.type,
    name: partial.name,
    order: partial.order,
    inputBindings: partial.inputBindings ?? {},
    configuration: partial.configuration ?? {},
    requiresApproval: partial.requiresApproval ?? false,
    retryPolicy: partial.retryPolicy ?? {
      maxAttempts: 3,
      backoffMs: [60_000, 300_000, 900_000],
    },
    timeoutMs: partial.timeoutMs ?? 120_000,
    onSuccess: null,
    onFailure: null,
    enabled: partial.enabled ?? true,
  };
}

export function wantsPhase3GenerateStep(text: string): boolean {
  return GENERATE_PATTERN.test(text);
}

export function wantsPhase3NotifyStep(text: string): boolean {
  return NOTIFY_PATTERN.test(text);
}

export function extractPhase3DocumentTitle(text: string): string {
  const quoted = text.match(/[「『]([^」』]{1,80})[」』]\s*という\s*文章/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();
  const plain = text.match(/([^\s、。]{1,80}?)\s*という\s*文章/);
  if (plain?.[1]?.trim()) return plain[1].trim();
  return (
    extractCalendarEventTitle(text)?.trim() || "MINERVOT Phase3テスト"
  );
}

export function buildWordGenerateStepFromText(
  sourceText: string,
  order: number,
): AutomationWorkflowStep {
  const title = extractPhase3DocumentTitle(sourceText);
  return baseStep({
    id: "word_generate",
    type: "word_generate",
    name: "文章生成",
    order,
    requiresApproval: false,
    configuration: {
      title,
      content: [
        `# ${title}`,
        "",
        "本資料は ATLAS Automation Phase 3 により生成されました。",
        "",
        "## 依頼原文",
        sourceText.slice(0, 500),
        "",
        "## 本文",
        `${title}に関する実務メモです。後続の外部操作・通知手順で利用します。`,
      ].join("\n"),
    },
  });
}

export function buildNotifyStepFromText(
  sourceText: string,
  order: number,
): AutomationWorkflowStep {
  const title = extractPhase3DocumentTitle(sourceText);
  return baseStep({
    id: "notify",
    type: "notify",
    name: "完了通知",
    order,
    requiresApproval: false,
    configuration: {
      title: "自動化が完了しました",
      message: `「${title}」の複数手順ワークフローが完了しました。`,
    },
  });
}

export function buildGmailStepFromText(
  sourceText: string,
  order: number,
): AutomationWorkflowStep {
  const title = extractPhase3DocumentTitle(sourceText);
  const draft = /下書き|送らず/.test(sourceText);
  return baseStep({
    id: "gmail",
    type: "gmail",
    name: draft ? "Gmail下書き" : "Gmail",
    order,
    requiresApproval: true,
    configuration: {
      mode: draft ? "draft" : "send",
      subject: title,
      body: sourceText.slice(0, 800),
      // Recipient must be configured by user / memory before live send.
      to: "",
    },
  });
}

/**
 * Build ordered Phase 3 steps:
 * optional generate → required externals → optional notify.
 * Phase 2 calendar-only NL (no generate/notify keywords) stays calendar-only.
 */
export function composePhase3WorkflowSteps(input: {
  sourceText: string;
  requiredExternals: readonly RequiredExternalAction[];
}): {
  steps: AutomationWorkflowStep[];
  composition:
    | "calendar_only"
    | "generate_calendar_notify"
    | "generate_gmail_notify"
    | "generate_external_notify"
    | "external_notify"
    | "custom";
} {
  const sourceText = input.sourceText.trim();
  const steps: AutomationWorkflowStep[] = [];
  let order = 0;

  const wantGenerate = wantsPhase3GenerateStep(sourceText);
  const wantNotify = wantsPhase3NotifyStep(sourceText);
  const wantGmail = GMAIL_PATTERN.test(sourceText);
  const wantDropbox = DROPBOX_PATTERN.test(sourceText);

  if (wantGenerate) {
    steps.push(buildWordGenerateStepFromText(sourceText, order++));
  }

  for (const action of input.requiredExternals) {
    if (action === "google_calendar") {
      steps.push(buildGoogleCalendarStepFromText(sourceText, order++));
    }
  }

  // Composition B: Gmail when NL/required asks. Execute still fail-closes without `to`.
  if (
    (wantGmail || input.requiredExternals.includes("gmail")) &&
    !steps.some((step) => step.type === "gmail")
  ) {
    steps.push(buildGmailStepFromText(sourceText, order++));
  }

  // Composition C helper: Dropbox save step when NL asks.
  if (
    (wantDropbox || input.requiredExternals.includes("dropbox")) &&
    !steps.some((step) => step.type === "dropbox")
  ) {
    steps.push(
      baseStep({
        id: "dropbox",
        type: "dropbox",
        name: "Dropbox保存",
        order: order++,
        requiresApproval: true,
        configuration: {
          folderPath: "/ATLAS/Automations",
        },
      }),
    );
  }

  const hasExternalOrDeliverableTail = steps.some(
    (step) => step.type !== "word_generate",
  );
  // Composition A always ends with notify when generate+external, or when NL asks.
  if (
    wantNotify ||
    (wantGenerate && hasExternalOrDeliverableTail)
  ) {
    if (!steps.some((step) => step.type === "notify")) {
      steps.push(buildNotifyStepFromText(sourceText, order++));
    }
  }

  // Re-number orders densely
  const normalized = steps.map((step, index) => ({ ...step, order: index }));

  let composition:
    | "calendar_only"
    | "generate_calendar_notify"
    | "generate_gmail_notify"
    | "generate_external_notify"
    | "external_notify"
    | "custom" = "custom";
  const types = normalized.map((s) => s.type);
  if (
    types.includes("word_generate") &&
    types.includes("google_calendar") &&
    types.includes("notify")
  ) {
    composition = "generate_calendar_notify";
  } else if (
    types.includes("word_generate") &&
    types.includes("gmail") &&
    types.includes("notify")
  ) {
    composition = "generate_gmail_notify";
  } else if (types.includes("word_generate") && types.includes("notify")) {
    composition = "generate_external_notify";
  } else if (types.length === 1 && types[0] === "google_calendar") {
    composition = "calendar_only";
  } else if (types.includes("notify") && !types.includes("word_generate")) {
    composition = "external_notify";
  }

  return { steps: normalized, composition };
}
