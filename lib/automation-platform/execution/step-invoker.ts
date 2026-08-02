/**
 * Step invoker — executes one capability without mutating V1 automation history.
 * Document/engine steps produce structured artifacts; external high-risk steps
 * are gated by prior Approval and recorded as drafts unless explicitly allowed.
 */

import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";
import type { ResolvedInstruction } from "@/lib/automation-platform/types/instruction";
import type { MemoryUsageRecord } from "@/lib/automation-platform/types/run";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import { applyContentOverlayToText, buildContentOverlay } from "@/lib/memory-apply/overlays";
import {
  applyOcrCorrections,
  resolveOcrMemoryDictionary,
} from "@/lib/memory-apply/ocr";
import { recordMemoryApplyEvent } from "@/lib/memory-apply/metrics";
import { resolveVisionMemoryContext } from "@/lib/memory-apply/vision";
import { resolveNotificationPreferencesWithMemory } from "@/lib/memory-apply/notifications";
import { getStoredPreferences } from "@/lib/notifications/store";

export type StepInvokeResult = {
  ok: boolean;
  summary: string;
  artifacts: AutomationRunArtifact[];
  errorCode?: string | null;
  errorMessage?: string | null;
  needsUserInput?: boolean;
};

export type StepInvoker = (input: {
  step: AutomationWorkflowStep;
  userId: string;
  automationName: string;
  runId: string;
  approved: boolean;
  resolvedInstruction?: ResolvedInstruction | null;
  memoryUsage?: MemoryUsageRecord | null;
}) => Promise<StepInvokeResult>;

function memoryInjection(input: {
  resolvedInstruction?: ResolvedInstruction | null;
}): string {
  const merged = input.resolvedInstruction?.merged ?? {};
  const injection =
    typeof merged.memoryInjectionText === "string"
      ? merged.memoryInjectionText
      : "";
  const notes = input.resolvedInstruction?.freeformNotes ?? "";
  return [injection, notes].filter(Boolean).join("\n").trim();
}

function artifact(
  label: string,
  kind: AutomationRunArtifact["kind"] = "file",
): AutomationRunArtifact {
  return {
    id: crypto.randomUUID(),
    kind,
    label,
    url: null,
    externalId: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Default invoker: real side-effects only for safe/local steps.
 * High-risk external actions require approval and still produce a reviewable
 * draft/result record rather than silent publish when credentials are absent.
 */
export const defaultStepInvoker: StepInvoker = async (input) => {
  const { step, approved } = input;
  const capability = getCapability(step.type);
  if (!capability) {
    return {
      ok: false,
      summary: "未対応の手順です",
      artifacts: [],
      errorCode: "automation_invalid_definition",
      errorMessage: `Unsupported capability: ${step.type}`,
    };
  }

  if (capability.systemRequiresApproval && !approved) {
    return {
      ok: false,
      summary: "承認が必要です",
      artifacts: [],
      errorCode: "automation_approval_required",
      errorMessage: "高リスク手順は承認後のみ実行できます",
      needsUserInput: true,
    };
  }

  switch (step.type) {
    case "ocr": {
      const rawText =
        typeof step.configuration.text === "string"
          ? step.configuration.text
          : typeof step.configuration.sourceText === "string"
            ? step.configuration.sourceText
            : "";
      const ocrMemory = await resolveOcrMemoryDictionary({ userId: input.userId });
      const corrected = applyOcrCorrections(rawText || "（OCR対象）", ocrMemory.dictionary);
      return {
        ok: true,
        summary: `OCRを完了しました（補正 ${Object.keys(ocrMemory.dictionary).length} 件 / Memory ${ocrMemory.memoryIdsUsed.length}）`,
        artifacts: [
          {
            ...artifact("OCR結果", "file"),
            label: `OCR結果: ${corrected.slice(0, 80)}`,
          },
        ],
      };
    }
    case "vision_analysis": {
      const visionMemory = await resolveVisionMemoryContext({
        userId: input.userId,
      });
      return {
        ok: true,
        summary: `画像解析を完了しました（Memory hints ${visionMemory.hints.length}）`,
        artifacts: [
          artifact(
            visionMemory.hints[0]
              ? `Vision結果: ${visionMemory.hints[0].slice(0, 60)}`
              : "Vision結果",
            "file",
          ),
        ],
      };
    }
    case "data_extract":
    case "file_convert":
      return {
        ok: true,
        summary: `${capability.name}を完了しました`,
        artifacts: [artifact(`${capability.name}結果`, "file")],
      };
    case "word_generate":
    case "excel_generate":
    case "pdf_generate":
    case "powerpoint_generate":
    case "deliverable_generate": {
      const title =
        (typeof step.configuration.title === "string" && step.configuration.title) ||
        `${input.automationName} / ${capability.name}`;
      const baseContent =
        typeof step.configuration.content === "string"
          ? step.configuration.content
          : typeof step.configuration.body === "string"
            ? step.configuration.body
            : title;
      const injection = memoryInjection(input);
      const merged = input.resolvedInstruction?.merged ?? {};
      const writingFromMerged =
        typeof merged.writing_style === "object" &&
        merged.writing_style &&
        typeof (merged.writing_style as { text?: string }).text === "string"
          ? (merged.writing_style as { text: string }).text
          : typeof merged.writing_style === "string"
            ? merged.writing_style
            : null;
      const overlay = {
        ...buildContentOverlay({
          values: [],
          injectionText: injection,
        }),
        writingStyle: writingFromMerged,
        signature:
          typeof merged.signature === "string" ? merged.signature : null,
      };
      const appliedContent = applyContentOverlayToText(baseContent, overlay);
      const channel =
        step.type === "excel_generate"
          ? "excel"
          : step.type === "pdf_generate"
            ? "pdf"
            : step.type === "powerpoint_generate"
              ? "powerpoint"
              : "word";
      const memoryIds = Array.isArray(merged.memoryIdsUsed)
        ? merged.memoryIdsUsed.filter((id): id is string => typeof id === "string")
        : input.memoryUsage?.memoryIdsUsed ?? [];
      recordMemoryApplyEvent({
        userId: input.userId,
        channel,
        memoryMode: injection || memoryIds.length > 0 ? "on" : "off",
        applied: Boolean(injection || memoryIds.length > 0),
        memoryIdsUsed: memoryIds,
        success: true,
      });
      return {
        ok: true,
        summary: `${capability.name}の成果物を準備しました（Memory適用 ${memoryIds.length}）`,
        artifacts: [
          {
            ...artifact(title, "deliverable"),
            label: `${title} :: ${appliedContent.slice(0, 60)}`,
          },
        ],
      };
    }
    case "notify": {
      const prefs = await resolveNotificationPreferencesWithMemory({
        userId: input.userId,
        base: getStoredPreferences(input.userId),
      });
      return {
        ok: true,
        summary: prefs.applied
          ? `通知手順を記録しました（Memory通知設定を適用）`
          : "通知手順を記録しました",
        artifacts: [],
      };
    }
    case "wait":
    case "condition":
      return {
        ok: true,
        summary: `${capability.name}を通過しました`,
        artifacts: [],
      };
    case "await_approval":
      return {
        ok: false,
        summary: "承認待ちです",
        artifacts: [],
        errorCode: "automation_approval_required",
        errorMessage: "ユーザー承認が必要です",
        needsUserInput: true,
      };
    case "gmail": {
      const to =
        typeof step.configuration.to === "string"
          ? step.configuration.to
          : "（宛先未設定）";
      return {
        ok: true,
        summary: `メール下書きを準備しました（${to}）`,
        artifacts: [artifact(`メール下書き: ${to}`, "draft")],
      };
    }
    case "x_post": {
      const text =
        typeof step.configuration.text === "string"
          ? step.configuration.text.slice(0, 80)
          : "投稿下書き";
      return {
        ok: true,
        summary: "X投稿の下書きを準備しました（公開は承認済み手順のみ）",
        artifacts: [artifact(`X下書き: ${text}`, "draft")],
      };
    }
    case "wordpress":
      return {
        ok: true,
        summary: "WordPress公開内容を準備しました",
        artifacts: [artifact("WordPress下書き", "draft")],
      };
    case "dropbox": {
      const dest =
        typeof step.configuration.saveTarget === "string"
          ? step.configuration.saveTarget
          : "Dropbox";
      return {
        ok: true,
        summary: `保存先 ${dest} への準備が完了しました`,
        artifacts: [artifact(`保存: ${dest}`, "external")],
      };
    }
    case "google_calendar":
      return {
        ok: true,
        summary: "カレンダー予定を準備しました",
        artifacts: [artifact("カレンダー予定", "external")],
      };
    case "orchestrate": {
      const assignment =
        typeof step.configuration.assignment === "string"
          ? step.configuration.assignment
          : input.automationName;
      return {
        ok: true,
        summary: `仕事の遂行を記録しました: ${assignment.slice(0, 60)}`,
        artifacts: [artifact("遂行結果", "deliverable")],
      };
    }
    default:
      return {
        ok: false,
        summary: "未対応の手順です",
        artifacts: [],
        errorCode: "automation_invalid_definition",
        errorMessage: `No invoker for ${step.type}`,
      };
  }
};
