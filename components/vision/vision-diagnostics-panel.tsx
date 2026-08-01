"use client";

import { useEffect, useState } from "react";

import {
  isVisionPipelineStage,
  labelForVisionStage,
} from "@/lib/vision/failure-stage";

type Diagnostic = {
  id: string;
  stages: Array<{
    stage: string;
    ok: boolean;
    at?: string;
    detail?: {
      errorCode?: string | null;
      userCode?: string | null;
      openaiErrorCode?: string | null;
      openaiErrorType?: string | null;
      artifactGate?: string | null;
      durationMs?: number | null;
      safeMessage?: string | null;
      rawErrorBody?: string | null;
      requestId?: string | null;
      httpStatus?: number | null;
    } | null;
  }>;
  model: string | null;
  mimeType: string | null;
  downloadedByteLength: number | null;
  base64Length: number | null;
  imageByteLength?: number | null;
  imageCount?: number | null;
  urlLength?: number | null;
  inputImageIncluded: boolean | null;
  analysisSuccess: boolean | null;
  payloadAttachmentIdCount?: number | null;
  detectedType?: string | null;
  artifactGate?: string | null;
  failedStage?: string | null;
  lastErrorCode?: string | null;
  lastUserCode?: string | null;
  openaiRequestId?: string | null;
  vercelRequestId?: string | null;
  openaiErrorBody?: string | null;
  openaiHttpStatus?: number | null;
  openaiErrorType?: string | null;
  openaiErrorCode?: string | null;
  openaiErrorMessage?: string | null;
  tracking?: {
    diagnosticId?: string | null;
    supabaseDomain?: string | null;
    vercelRequestId?: string | null;
    openaiRequestId?: string | null;
    jobId?: string | null;
  } | null;
};

type VisionDiagnosticsPanelProps = {
  diagnosticId?: string | null;
  enabled: boolean;
  showToggle?: boolean;
  onToggle?: () => void;
};

function canShowVisionDiagnostics(): boolean {
  if (process.env.NEXT_PUBLIC_ATLAS_DEBUG === "true") return true;
  if (process.env.NODE_ENV === "development") return true;
  return false;
}

export function VisionDiagnosticsPanel({
  diagnosticId,
  enabled,
  showToggle = false,
  onToggle,
}: VisionDiagnosticsPanelProps) {
  const [row, setRow] = useState<Diagnostic | null>(null);
  const [allowed, setAllowed] = useState(canShowVisionDiagnostics());

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (canShowVisionDiagnostics()) {
        setAllowed(true);
        return;
      }
      void fetch("/api/auth/owner-status", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { isOwner?: boolean } | null) => {
          if (!cancelled) setAllowed(Boolean(body?.isOwner));
        })
        .catch(() => {
          if (!cancelled) setAllowed(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !allowed || !diagnosticId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/vision/diagnostics/${encodeURIComponent(diagnosticId)}`,
        );
        if (!response.ok) return;
        const payload = (await response.json()) as { diagnostic?: Diagnostic };
        if (!cancelled) setRow(payload.diagnostic ?? null);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [diagnosticId, enabled, allowed]);

  if (!allowed) return null;

  const stageLabel = (stage: string, ok: boolean): string => {
    const ja = isVisionPipelineStage(stage)
      ? labelForVisionStage(stage)
      : stage;
    return `${ja} (${stage}): ${ok ? "成功" : "失敗"}`;
  };

  return (
    <div className="space-y-2">
      {showToggle && onToggle && (
        <button
          type="button"
          className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline"
          onClick={onToggle}
        >
          {enabled ? "診断を隠す" : "管理者診断を表示"}
        </button>
      )}
      {enabled && row && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 text-xs text-[var(--text-secondary)]">
          <p className="mb-2 font-medium text-foreground">画像解析診断（管理者）</p>
          <ul className="space-y-1">
            <li className="font-mono">診断ID: {row.id}</li>
            {row.tracking && (
              <li className="break-all font-mono">
                tracking: supabase={row.tracking.supabaseDomain ?? "—"} /
                vercel={row.tracking.vercelRequestId ?? row.vercelRequestId ?? "—"} /
                openai={row.tracking.openaiRequestId ?? row.openaiRequestId ?? "—"}
              </li>
            )}
            {row.failedStage && (
              <li>
                失敗工程:{" "}
                {isVisionPipelineStage(row.failedStage)
                  ? labelForVisionStage(row.failedStage)
                  : row.failedStage}{" "}
                ({row.failedStage})
              </li>
            )}
            {row.lastErrorCode && <li>errorCode: {row.lastErrorCode}</li>}
            {row.lastUserCode && <li>userCode: {row.lastUserCode}</li>}
            {row.openaiErrorMessage && (
              <li className="break-all">OpenAI message: {row.openaiErrorMessage}</li>
            )}
            {(row.openaiHttpStatus != null ||
              row.openaiErrorType ||
              row.openaiErrorCode) && (
              <li className="break-all font-mono">
                OpenAI status={String(row.openaiHttpStatus ?? "—")} type=
                {row.openaiErrorType ?? "—"} code={row.openaiErrorCode ?? "—"}
              </li>
            )}
            {row.openaiRequestId && (
              <li className="break-all font-mono">
                openai request_id: {row.openaiRequestId}
              </li>
            )}
            {row.openaiErrorBody && (
              <li>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--surface)] p-2 font-mono text-[10px] text-foreground">
                  {row.openaiErrorBody}
                </pre>
              </li>
            )}
            {row.stages.map((stage, index) => (
              <li key={`${stage.stage}-${index}`}>
                {stageLabel(stage.stage, stage.ok)}
                {stage.detail?.errorCode
                  ? ` [${stage.detail.errorCode}]`
                  : ""}
                {stage.detail?.safeMessage
                  ? ` — ${stage.detail.safeMessage}`
                  : ""}
                {typeof stage.detail?.durationMs === "number"
                  ? ` ${stage.detail.durationMs}ms`
                  : ""}
              </li>
            ))}
            <li>
              Processed bytes:{" "}
              {row.downloadedByteLength?.toLocaleString("ja-JP") ?? "—"}
            </li>
            <li>
              Image bytes / base64 / urlLength:{" "}
              {row.imageByteLength?.toLocaleString("ja-JP") ?? "—"} /{" "}
              {row.base64Length?.toLocaleString("ja-JP") ?? "—"} /{" "}
              {row.urlLength?.toLocaleString("ja-JP") ?? "—"}
            </li>
            <li>Image count: {row.imageCount ?? "—"}</li>
            <li>MIME: {row.mimeType ?? "—"}</li>
            <li>Model: {row.model ?? "—"}</li>
            <li>
              input_image:{" "}
              {row.inputImageIncluded == null
                ? "—"
                : row.inputImageIncluded
                  ? "included"
                  : "missing"}
            </li>
            <li>
              Analysis:{" "}
              {row.analysisSuccess == null
                ? "—"
                : row.analysisSuccess
                  ? "success"
                  : "failed"}
            </li>
            <li>
              Payload attachmentIds: {row.payloadAttachmentIdCount ?? "—"}
            </li>
            <li>detectedType: {row.detectedType ?? "—"}</li>
            <li>Artifact gate: {row.artifactGate ?? "—"}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
