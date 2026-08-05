"use client";

import { Button } from "@/components/ui/button";
import type { CommanderVisionGate } from "@/lib/commander/types";
import { USER_SOFT_RETRY_MESSAGE } from "@/lib/reliability/ops-progress";
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

  // P06: ban error screens — soft auto-retry for transient failures.
  const title =
    gate.status === "needs_input"
      ? gate.message
      : gate.status === "config_missing"
        ? "確認が必要です"
        : "自動で再試行しています";

  const isAiFailure =
    failedStage === "vision_response" ||
    gate.userCode === "ai_analyze_failed" ||
    gate.developerCode === "openai_failed" ||
    gate.developerCode === "timeout" ||
    gate.developerCode === "rate_limited" ||
    Boolean(gate.openai);

  // User-facing Japanese only — never dump OpenAI internals here.
  const detail =
    gate.status === "needs_input"
      ? "画像は読み取れましたが、依頼の必須項目を確認できませんでした。成果物はまだ作成していません。"
      : gate.userCode === "missing_attachment_ids"
        ? "画像の添付IDが送信されていません。ファイル名だけでは解析できません。画像を選び直してください。"
        : USER_SOFT_RETRY_MESSAGE;
  void messageForVisionStage;
  void stageLabel;

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
    <div
      role="status"
      aria-live="polite"
      className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4"
    >
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {detail && (
          <p className="mt-1 whitespace-pre-line text-sm text-[var(--text-secondary)]">
            {detail}
          </p>
        )}

        {/* Admin / developer only: OpenAI body + request_id */}
        {showDeveloperHint && isAiFailure && (
          <div className="mt-3 space-y-2 rounded-lg border border-amber-200/80 bg-white/70 p-3 text-xs text-[var(--text-secondary)]">
            <p className="font-medium text-foreground">管理者診断（OpenAI詳細）</p>
            {gate.cause && (
              <p>
                <span className="text-foreground">内部原因: </span>
                {gate.cause}
              </p>
            )}
            {gate.openai?.requestId && (
              <p className="break-all font-mono">
                request_id: {gate.openai.requestId}
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
