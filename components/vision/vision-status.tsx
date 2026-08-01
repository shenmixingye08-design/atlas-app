"use client";

import { visionPhaseLabel } from "@/lib/vision/job-phase-client";

type VisionStatusProps = {
  status?: string | null;
  label?: string | null;
  analyzing?: boolean;
  error?: string | null;
};

export function VisionStatus({
  status,
  label,
  analyzing,
  error,
}: VisionStatusProps) {
  if (!status && !analyzing && !error && !label) return null;

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm">
      {analyzing && <p className="text-accent">画像を解析しています…</p>}
      {!analyzing && status && (
        <p className="text-foreground">{visionPhaseLabel(status)}</p>
      )}
      {label && <p className="mt-1 text-[var(--text-secondary)]">{label}</p>}
      {error && <p className="mt-1 text-red-600">{error}</p>}
    </div>
  );
}
