"use client";

import { useMemo, useState } from "react";

import { WeeklyReportActivation } from "@/components/activation/weekly-report-activation";
import type { ActivationResult, ActivationStepId } from "@/lib/activation";
import { cn } from "@/lib/design-system/cn";

const PREVIEW_RESULT: ActivationResult = {
  automationId: "preview-auto-1",
  projectId: "preview-auto-1",
  runId: "preview-run-1",
  artifactId: "preview-dlv-1",
  diagnosticId: "preview-diag-1",
  fileName: "毎週の営業レポート.docx",
  downloadUrl: "/api/deliverables/preview-dlv-1",
  formatLabel: "Word",
  createdAt: new Date().toISOString(),
  nextRunAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  durationMs: 42_000,
  sizeBytes: 12_480,
  hasPkHeader: true,
  ownershipConfirmed: true,
};

const STEPS: { id: ActivationStepId; label: string }[] = [
  { id: "choose", label: "1 選ぶ" },
  { id: "configure", label: "2 設定" },
  { id: "run", label: "3 実行中" },
  { id: "receive", label: "4 完成" },
];

export function ActivationPreviewClient() {
  const [step, setStep] = useState<ActivationStepId>("choose");
  const [viewport, setViewport] = useState<"pc" | "mobile">("pc");

  const previewResult = useMemo(
    () => (step === "receive" ? PREVIEW_RESULT : null),
    [step],
  );

  return (
    <div className="min-h-[100dvh] bg-[var(--background)] p-4">
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap gap-2">
        {STEPS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setStep(item.id)}
            className={cn(
              "min-h-11 rounded-[var(--radius-md)] border px-3 text-sm",
              step === item.id
                ? "border-[var(--brand)] bg-[var(--brand-muted)] font-semibold"
                : "border-[var(--border)]",
            )}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] px-3 text-sm"
          onClick={() =>
            setViewport((value) => (value === "pc" ? "mobile" : "pc"))
          }
        >
          {viewport === "pc" ? "PC" : "360px"}
        </button>
      </div>
      <div
        className={cn(
          "mx-auto overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]",
          viewport === "mobile" ? "w-[360px]" : "max-w-lg",
        )}
        data-testid="activation-preview-frame"
        data-step={step}
        data-viewport={viewport}
      >
        <WeeklyReportActivation
          key={`${step}-${viewport}`}
          embedded
          previewStep={step === "run" ? "run" : step}
          previewResult={previewResult}
        />
      </div>
    </div>
  );
}
