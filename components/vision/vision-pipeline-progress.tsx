"use client";

import { cn } from "@/lib/design-system/cn";
import {
  VISION_PIPELINE_STEPS,
  visionPhaseLabel,
  visionPipelineStepIndex,
} from "@/lib/vision/job-phase-client";

type VisionPipelineProgressProps = {
  phase?: string | null;
  attempt?: number;
  className?: string;
  error?: string | null;
};

/**
 * Realtime vision pipeline:
 * 画像受信 → 画像補正 → AI解析 → 成果物生成 → 完成
 */
export function VisionPipelineProgress({
  phase,
  attempt,
  className,
  error,
}: VisionPipelineProgressProps) {
  const activeIndex = visionPipelineStepIndex(phase);
  const failed = phase === "failed";
  const needsInput = phase === "needs_input";

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-lg space-y-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 py-5",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          {failed
            ? "画像解析に失敗しました"
            : needsInput
              ? "追加確認が必要です"
              : visionPhaseLabel(phase)}
        </p>
        {attempt && attempt > 1 ? (
          <p className="text-xs text-[var(--text-secondary)]">試行 {attempt}</p>
        ) : null}
      </div>

      <ol className="space-y-2">
        {VISION_PIPELINE_STEPS.map((step, index) => {
          const done = activeIndex > index || phase === "completed";
          const current = activeIndex === index && phase !== "completed";
          return (
            <li key={step} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  done && "bg-[var(--accent)] text-white",
                  current && "bg-[var(--accent)]/20 text-accent animate-soft-pulse",
                  !done && !current && "bg-[var(--background-subtle)] text-[var(--text-secondary)]",
                )}
                aria-hidden
              >
                {done ? "✓" : index + 1}
              </span>
              <span
                className={cn(
                  current && "font-medium text-foreground",
                  done && !current && "text-[var(--text-secondary)]",
                  !done && !current && "text-[var(--text-secondary)]",
                )}
              >
                {visionPhaseLabel(step)}
              </span>
              {current ? (
                <span className="ml-auto text-xs text-accent">処理中…</span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {error ? (
        <p className="text-left text-xs text-[var(--status-warning)]">{error}</p>
      ) : null}
    </div>
  );
}
