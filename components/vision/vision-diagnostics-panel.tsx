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
    } | null;
  }>;
  model: string | null;
  mimeType: string | null;
  downloadedByteLength: number | null;
  base64Length: number | null;
  inputImageIncluded: boolean | null;
  analysisSuccess: boolean | null;
  payloadAttachmentIdCount?: number | null;
  detectedType?: string | null;
  artifactGate?: string | null;
  failedStage?: string | null;
  lastErrorCode?: string | null;
  lastUserCode?: string | null;
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
    if (canShowVisionDiagnostics()) {
      setAllowed(true);
      return;
    }
    let cancelled = false;
    void fetch("/api/auth/owner-status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { isOwner?: boolean } | null) => {
        if (!cancelled) setAllowed(Boolean(body?.isOwner));
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
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
            {row.stages.map((stage, index) => (
              <li key={`${stage.stage}-${index}`}>
                {stageLabel(stage.stage, stage.ok)}
                {stage.detail?.errorCode
                  ? ` [${stage.detail.errorCode}]`
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
