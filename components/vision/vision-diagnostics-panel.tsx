"use client";

import { useEffect, useState } from "react";

type Diagnostic = {
  id: string;
  stages: Array<{ stage: string; ok: boolean }>;
  model: string | null;
  mimeType: string | null;
  downloadedByteLength: number | null;
  base64Length: number | null;
  inputImageIncluded: boolean | null;
  analysisSuccess: boolean | null;
  payloadAttachmentIdCount?: number | null;
  detectedType?: string | null;
  artifactGate?: string | null;
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
    const map: Record<string, string> = {
      upload: "Upload",
      storage_download: "Storage",
      data_url: "Data URL",
      vision_request: "Vision request",
      vision_response: "Vision response",
      schema_validation: "Schema validation",
      artifact_handoff: "Artifact handoff",
      blocked: "Blocked",
    };
    return `${map[stage] ?? stage}: ${ok ? "success" : "failed"}`;
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
            {row.stages.map((stage, index) => (
              <li key={`${stage.stage}-${index}`}>
                {stageLabel(stage.stage, stage.ok)}
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
