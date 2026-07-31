"use client";

import { Button } from "@/components/ui/button";
import type { CommanderVisionGate } from "@/lib/commander/types";
import {
  isVisionPipelineStage,
  labelForVisionStage,
  messageForVisionStage,
} from "@/lib/vision/failure-stage";

type VisionFailurePanelProps = {
  gate: CommanderVisionGate;
  onRetryAnalyze?: () => void;
  onRetake?: () => void;
  onPickAnother?: () => void;
  /** Show developer hint (diagnosticId / stage / codes). */
  showDeveloperHint?: boolean;
};

export function VisionFailurePanel({
  gate,
  onRetryAnalyze,
  onRetake,
  onPickAnother,
  showDeveloperHint = false,
}: VisionFailurePanelProps) {
  const failedStage =
    gate.failedStage && isVisionPipelineStage(gate.failedStage)
      ? gate.failedStage
      : null;
  const stageLabel =
    gate.failedStageLabel ??
    (failedStage ? labelForVisionStage(failedStage) : null);

  const title =
    gate.status === "needs_input"
      ? gate.message
      : gate.status === "config_missing"
        ? "画像解析の設定が不足しています"
        : stageLabel
          ? `画像処理に失敗しました（${stageLabel}）`
          : "画像の内容を解析できませんでした";

  const isAiFailure =
    failedStage === "vision_response" ||
    gate.userCode === "ai_analyze_failed" ||
    gate.developerCode === "openai_failed" ||
    gate.developerCode === "timeout" ||
    gate.developerCode === "rate_limited" ||
    Boolean(gate.openai);

  const cause =
    gate.cause?.trim() ||
    gate.openai?.message?.trim() ||
    (isAiFailure ? null : null);

  const detail =
    gate.status === "needs_input"
      ? "画像は読み取れましたが、依頼の必須項目を確認できませんでした。成果物はまだ作成していません。"
      : gate.userCode === "missing_attachment_ids"
        ? "画像の添付IDが送信されていません。ファイル名だけでは解析できません。画像を選び直してください。"
        : cause
          ? null
          : failedStage && !isAiFailure
            ? messageForVisionStage(failedStage)
            : gate.message ||
              (gate.analysisSuccess
                ? null
                : "成果物の生成は停止しました。診断情報を確認してください。");

  const openaiBody =
    gate.openai?.rawErrorBody?.trim() ||
    (gate.openai
      ? JSON.stringify(
          {
            status: gate.openai.httpStatus,
            type: gate.openai.type,
            code: gate.openai.code,
            message: gate.openai.message,
            request_id: gate.openai.requestId,
          },
          null,
          2,
        )
      : null);

  const developerHint = [
    gate.diagnosticId ? `診断ID: ${gate.diagnosticId}` : null,
    gate.failedStage ? `工程: ${gate.failedStage}` : null,
    gate.userCode ? `userCode: ${gate.userCode}` : null,
    gate.developerCode ? `errorCode: ${gate.developerCode}` : null,
    gate.vercelRequestId ? `vercel: ${gate.vercelRequestId}` : null,
    gate.openai?.requestId ? `openai_request_id: ${gate.openai.requestId}` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <div className="space-y-3 rounded-xl border border-amber-300/70 bg-amber-50/50 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {detail && (
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{detail}</p>
        )}
        {stageLabel && gate.status !== "needs_input" && (
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            失敗した工程: {stageLabel}
          </p>
        )}

        {/* AI解析失敗: 原因 / OpenAIエラー本文 / request_id を必ず表示（generic禁止） */}
        {isAiFailure && (
          <div className="mt-3 space-y-2 rounded-lg border border-amber-200/80 bg-white/70 p-3 text-xs text-[var(--text-secondary)]">
            <p className="font-medium text-foreground">AI解析の失敗詳細</p>
            <p>
              <span className="text-foreground">原因: </span>
              {cause || gate.message || "原因未取得（ログの診断IDを確認してください）"}
            </p>
            {gate.openai?.requestId && (
              <p className="break-all font-mono">
                <span className="font-sans text-[var(--text-secondary)]">
                  request_id:{" "}
                </span>
                {gate.openai.requestId}
              </p>
            )}
            {(gate.openai?.httpStatus != null ||
              gate.openai?.type ||
              gate.openai?.code) && (
              <p className="break-all font-mono">
                status={String(gate.openai.httpStatus ?? "—")} / type=
                {gate.openai.type ?? "—"} / code={gate.openai.code ?? "—"}
              </p>
            )}
            {openaiBody && (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--surface-elevated)] p-2 font-mono text-[11px] text-foreground">
                {openaiBody}
              </pre>
            )}
            {gate.diagnosticId && (
              <p className="break-all font-mono">
                診断ID: {gate.diagnosticId}
                {gate.vercelRequestId
                  ? ` / Vercel: ${gate.vercelRequestId}`
                  : ""}
              </p>
            )}
          </div>
        )}

        {showDeveloperHint && developerHint && (
          <p className="mt-2 break-all font-mono text-[11px] text-[var(--text-secondary)]">
            {developerHint}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {onRetryAnalyze && gate.status !== "config_missing" && (
          <Button type="button" size="sm" onClick={onRetryAnalyze}>
            再解析する
          </Button>
        )}
        {onRetake && (
          <Button type="button" size="sm" variant="secondary" onClick={onRetake}>
            画像を撮り直す
          </Button>
        )}
        {onPickAnother && (
          <Button type="button" size="sm" variant="ghost" onClick={onPickAnother}>
            別の画像を選ぶ
          </Button>
        )}
      </div>
    </div>
  );
}
