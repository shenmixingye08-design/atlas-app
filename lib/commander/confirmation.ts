import "server-only";

import { createDefaultExecutionFlow } from "@/lib/automations/execution-flow";
import {
  clampConfirmationLevel,
  flowHasCriticalExternalActions,
} from "@/lib/automations/display";
import type { CommanderPlan } from "./types";

/** Operations that must wait for explicit user confirmation. */
const CRITICAL_ASSIGNMENT_PATTERNS: RegExp[] = [
  /メールを?送信|送信して|send\s*(the\s*)?(mail|email|メッセージ)/i,
  /sns投稿|ツイート|xに投稿|instagram|投稿して|post\s*(to\s*)?(x|twitter|sns)/i,
  /ファイルを?削除|削除して|ゴミ箱|delete\s*(file|files|mail)/i,
  /予定を?削除|予定キャンセル|イベント削除|cancel\s*(the\s*)?(event|meeting)/i,
  /共有リンク|公開リンク|share\s*link|anyone\s*with\s*the\s*link/i,
  /外部公開|webに公開|wordpress.*公開|公開して/i,
  /決済|stripe|課金|支払い|チャージ|checkout/i,
  /データを?変更|一括更新|上書き保存して/i,
  /取消|取り消し不能|取り消しできない/i,
];

export type CommanderConfirmationDecision = {
  required: boolean;
  reasons: string[];
  /** Mapped automation confirmation level after clamping. */
  confirmationLevel: "full_auto" | "approve_then_run";
};

export function evaluateCommanderConfirmation(
  assignment: string,
  plan: CommanderPlan,
): CommanderConfirmationDecision {
  const reasons: string[] = [];
  const flow = createDefaultExecutionFlow(plan.classification.templateId);

  // Enable external steps that the plan marked required so clamp sees them.
  const withRequiredExternals = {
    ...flow,
    steps: flow.steps.map((step) => {
      const needsExternal = plan.requiredExternalServices.some(
        (service) =>
          service.required &&
          (step.id.includes("publish") ||
            step.id.includes("email") ||
            step.id.includes("gdrive") ||
            step.id.includes("sns") ||
            step.id.includes("wordpress") ||
            step.id.includes("youtube")),
      );
      return needsExternal ? { ...step, enabled: true } : step;
    }),
  };

  // Only treat enabled external publish/send steps as critical when present.
  if (flowHasCriticalExternalActions(withRequiredExternals)) {
    const hasSendIntent =
      /送信|投稿して|公開して|共有リンク|決済|削除/.test(assignment);
    if (hasSendIntent) {
      reasons.push("外部公開・送信・投稿など重要な外部アクションが含まれます");
    }
  }

  for (const pattern of CRITICAL_ASSIGNMENT_PATTERNS) {
    if (pattern.test(assignment)) {
      reasons.push("取消が難しい操作（送信・投稿・削除・公開・決済など）を含みます");
      break;
    }
  }

  const requiredServicesDisconnected = plan.requiredExternalServices.filter(
    (service) =>
      service.required &&
      service.connectionStatus !== "connected" &&
      service.connectionStatus !== "pending",
  );
  if (requiredServicesDisconnected.length > 0) {
    reasons.push(
      `必須の外部サービスが未接続です: ${requiredServicesDisconnected
        .map((service) => service.label)
        .join("、")}`,
    );
  }

  if (/覚えて|記憶して|習慣として/.test(assignment)) {
    reasons.push(
      "習慣・記憶として保存するには確認が必要です（定期実行は自動では開始しません）",
    );
  }

  const level = clampConfirmationLevel("full_auto", withRequiredExternals);
  const required = reasons.length > 0 || level === "approve_then_run";

  return {
    required,
    reasons: [...new Set(reasons)],
    confirmationLevel: required ? "approve_then_run" : "full_auto",
  };
}

/** True when the user mainly asks ATLAS to remember a recurring habit. */
export function isRememberHabitAssignment(assignment: string): boolean {
  return (
    /覚えて|記憶して|習慣として/.test(assignment) &&
    (/毎週|毎日|毎月|定期|習慣|作業として/.test(assignment) ||
      /まとめる|振り返|レポート/.test(assignment))
  );
}
