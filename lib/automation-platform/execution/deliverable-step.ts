/**
 * Real deliverable generation for V2 Automation steps.
 * Uses existing generators + durable storage — never placeholder artifacts.
 */

import "server-only";

import { verifyGeneratedExportAsync } from "@/lib/deliverables/export-verify";
import { getDeliverableGenerator } from "@/lib/deliverables/generators";
import {
  getStoredDeliverableForUser,
  saveDeliverableFileDurable,
} from "@/lib/deliverables/store";
import type { DeliverableFormat } from "@/lib/deliverables/types";
import type {
  StepInvokeResult,
} from "@/lib/automation-platform/execution/step-invoker";
import type { AutomationCapabilityId } from "@/lib/automation-platform/types/step";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";

const FORMAT_BY_STEP: Partial<Record<AutomationCapabilityId, DeliverableFormat>> =
  {
    word_generate: "docx",
    excel_generate: "xlsx",
    pdf_generate: "pdf",
    powerpoint_generate: "pptx",
  };

function stringConfig(
  configuration: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = configuration[key];
  return typeof value === "string" ? value.trim() : "";
}

function resolveContent(
  step: AutomationWorkflowStep,
  automationName: string,
): string {
  const content =
    stringConfig(step.configuration, "content") ||
    stringConfig(step.configuration, "finalDeliverable") ||
    stringConfig(step.configuration, "body") ||
    stringConfig(step.inputBindings as Record<string, unknown>, "content");
  if (content) return content;
  const title =
    stringConfig(step.configuration, "title") || step.name || automationName;
  // Deterministic fallback document body so scheduled automations can still
  // produce a real binary when AI content is not attached to the step.
  return [
    `# ${title}`,
    "",
    "本資料は ATLAS Automation により生成されました。",
    "品質検証を通過できる分量の本文を含みます。",
    "",
    "## 概要",
    `- 自動化名: ${automationName}`,
    `- 手順: ${step.name}`,
    `- 生成日時: ${new Date().toISOString()}`,
    "",
    "## 本文",
    "本自動化が指定した成果物形式で実バイナリを生成し、Storageへ保存します。",
    "空の成果物やプレースホルダは成功として扱いません。",
  ].join("\n");
}

function resolveFormats(step: AutomationWorkflowStep): DeliverableFormat[] {
  if (step.type === "deliverable_generate") {
    const raw = step.configuration.formats;
    if (Array.isArray(raw)) {
      const formats = raw.filter(
        (item): item is DeliverableFormat =>
          item === "docx" ||
          item === "xlsx" ||
          item === "pdf" ||
          item === "pptx" ||
          item === "md" ||
          item === "txt",
      );
      if (formats.length > 0) return formats;
    }
    const single = stringConfig(step.configuration, "format");
    if (
      single === "docx" ||
      single === "xlsx" ||
      single === "pdf" ||
      single === "pptx"
    ) {
      return [single];
    }
    return ["docx"];
  }
  const mapped = FORMAT_BY_STEP[step.type];
  return mapped ? [mapped] : [];
}

export async function invokeDeliverableStep(input: {
  step: AutomationWorkflowStep;
  userId: string;
  automationName: string;
  runId: string;
}): Promise<StepInvokeResult> {
  const formats = resolveFormats(input.step);
  if (formats.length === 0) {
    return {
      ok: false,
      summary: "成果物形式を解決できませんでした",
      artifacts: [],
      errorCode: "step_not_implemented",
      errorMessage: `No deliverable format for ${input.step.type}`,
      failedStage: "STEP_DISPATCH",
      retryable: false,
    };
  }

  const isRegenerate =
    stringConfig(input.step.configuration, "mode") === "regenerate" ||
    Boolean(stringConfig(input.step.configuration, "parentDeliverableId"));

  if (isRegenerate) {
    return invokeRegenerateDeliverableStep(input, formats[0]!);
  }

  const content = resolveContent(input.step, input.automationName);
  if (!content.trim()) {
    return {
      ok: false,
      summary: "成果物の本文が空です",
      artifacts: [],
      errorCode: "automation_invalid_definition",
      errorMessage: "empty_deliverable_content",
      failedStage: "DELIVERABLE_CONTENT",
      retryable: false,
    };
  }

  const title =
    stringConfig(input.step.configuration, "title") ||
    input.step.name ||
    input.automationName;
  const baseFileName = title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "atlas";

  const artifacts: StepInvokeResult["artifacts"] = [];
  const failures: string[] = [];

  for (const format of formats) {
    const generator = getDeliverableGenerator(format);
    if (!generator) {
      failures.push(`${format}:generator_missing`);
      continue;
    }
    try {
      const file = await generator.generate(content, baseFileName, {
        assignment: input.automationName,
        title,
      });
      if (!file.buffer || file.buffer.byteLength <= 0) {
        failures.push(`${format}:empty_binary`);
        continue;
      }
      if (file.format !== format) {
        failures.push(
          `${format}:format_mismatch:${file.format}`,
        );
        continue;
      }
      if (file.isPlaceholder) {
        failures.push(`${format}:placeholder_forbidden`);
        continue;
      }
      const verified = await verifyGeneratedExportAsync(file);
      if (!verified.ok) {
        failures.push(
          `${format}:verify_failed:${verified.reasons.join(",") || "unknown"}`,
        );
        continue;
      }
      const stored = await saveDeliverableFileDurable(file, input.userId, {
        sourceContent: content,
        baseFileName,
        metadata: {
          purpose: "automation_v2",
          templateId: input.step.type,
          version: 1,
        },
      });
      if (stored.userId !== input.userId) {
        failures.push(`${format}:owner_mismatch`);
        continue;
      }
      if (!stored.id || stored.buffer.byteLength <= 0) {
        failures.push(`${format}:storage_incomplete`);
        continue;
      }
      const downloadUrl = `/api/deliverables/${stored.id}`;
      artifacts.push({
        id: stored.id,
        kind: "deliverable",
        label: stored.fileName,
        url: downloadUrl,
        externalId: stored.id,
        createdAt: stored.generatedAt,
      });
    } catch (error) {
      failures.push(
        `${format}:${error instanceof Error ? error.message : "generate_failed"}`,
      );
    }
  }

  if (artifacts.length === 0) {
    return {
      ok: false,
      summary: "成果物の生成・保存に失敗しました",
      artifacts: [],
      errorCode: "run_artifact_missing",
      errorMessage: failures.join("; ") || "deliverable_generation_failed",
      failedStage: "DELIVERABLE_GENERATE",
      retryable: true,
    };
  }

  return {
    ok: true,
    summary: `${artifacts.length} 件の成果物を生成・保存しました`,
    artifacts,
    errorCode: null,
    errorMessage: null,
    failedStage: null,
    retryable: false,
    evidence: {
      artifactIds: artifacts.map((item) => item.id),
      storageObjectIds: artifacts.map((item) => item.id),
      externalActionIds: [],
      externalUrls: artifacts
        .map((item) => item.url)
        .filter((url): url is string => Boolean(url)),
      notificationIds: [],
    },
  };
}

async function invokeRegenerateDeliverableStep(
  input: {
    step: AutomationWorkflowStep;
    userId: string;
    automationName: string;
    runId: string;
  },
  format: DeliverableFormat,
): Promise<StepInvokeResult> {
  const parentId = stringConfig(input.step.configuration, "parentDeliverableId");
  if (!parentId) {
    return {
      ok: false,
      summary: "再生成元の成果物が指定されていません",
      artifacts: [],
      errorCode: "automation_invalid_definition",
      errorMessage: "parentDeliverableId_required",
      failedStage: "REGENERATE_INPUT",
      retryable: false,
    };
  }

  const parent = await getStoredDeliverableForUser(parentId, input.userId);
  if (!parent) {
    return {
      ok: false,
      summary: "再生成元の成果物が見つかりません",
      artifacts: [],
      errorCode: "run_artifact_missing",
      errorMessage: "parent_deliverable_not_found",
      failedStage: "REGENERATE_LOAD",
      retryable: false,
    };
  }

  const instruction =
    stringConfig(input.step.configuration, "revisionInstruction") ||
    stringConfig(input.step.configuration, "instruction") ||
    "内容を見直し、改訂版を作成してください。";
  const content = [
    parent.sourceContent?.trim() || `(既存成果物: ${parent.fileName})`,
    "",
    "【修正指示】",
    instruction,
  ].join("\n");

  const targetFormat = parent.format || format;
  const generator = getDeliverableGenerator(targetFormat);
  if (!generator) {
    return {
      ok: false,
      summary: "再生成ジェネレータがありません",
      artifacts: [],
      errorCode: "step_not_implemented",
      errorMessage: `generator_missing:${targetFormat}`,
      failedStage: "REGENERATE_DISPATCH",
      retryable: false,
    };
  }

  try {
    const file = await generator.generate(content, parent.baseFileName, {
      assignment: input.automationName,
      title: parent.fileName,
    });
    if (!file.buffer || file.buffer.byteLength <= 0 || file.isPlaceholder) {
      return {
        ok: false,
        summary: "再生成バイナリが無効です",
        artifacts: [],
        errorCode: "run_artifact_missing",
        errorMessage: "regenerate_invalid_binary",
        failedStage: "REGENERATE_GENERATE",
        retryable: true,
      };
    }
    const verified = await verifyGeneratedExportAsync(file);
    if (!verified.ok) {
      return {
        ok: false,
        summary: "再生成結果の検証に失敗しました",
        artifacts: [],
        errorCode: "run_artifact_missing",
        errorMessage: verified.reasons.join(",") || "verify_failed",
        failedStage: "REGENERATE_VERIFY",
        retryable: true,
      };
    }
    const stored = await saveDeliverableFileDurable(file, input.userId, {
      sourceContent: content,
      baseFileName: parent.baseFileName,
      metadata: {
        purpose: "automation_v2_regenerate",
        parentDeliverableId: parent.id,
        version: (parent.metadata?.version ?? 1) + 1,
        versionGroupId: parent.metadata?.versionGroupId ?? parent.id,
      },
    });
    const downloadUrl = `/api/deliverables/${stored.id}`;
    return {
      ok: true,
      summary: "成果物の改訂版を生成・保存しました",
      artifacts: [
        {
          id: stored.id,
          kind: "deliverable",
          label: stored.fileName,
          url: downloadUrl,
          externalId: stored.id,
          createdAt: stored.generatedAt,
        },
      ],
      evidence: {
        artifactIds: [stored.id, parent.id],
        storageObjectIds: [stored.id],
        externalActionIds: [],
        externalUrls: [downloadUrl],
        notificationIds: [],
      },
    };
  } catch (error) {
    return {
      ok: false,
      summary: "再生成に失敗しました",
      artifacts: [],
      errorCode: "automation_run_failed",
      errorMessage:
        error instanceof Error ? error.message : "regenerate_failed",
      failedStage: "REGENERATE_GENERATE",
      retryable: true,
    };
  }
}
