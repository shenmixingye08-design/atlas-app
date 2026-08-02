"use client";

import Link from "next/link";
import { StatusBadge, type RunVisualStatus } from "@/components/automation-first/status-badge";
import { cn } from "@/lib/design-system/cn";

export type AttentionKind =
  | "approval"
  | "input"
  | "reconnect"
  | "failed"
  | "billing"
  | "quota";

const KIND_STATUS: Record<AttentionKind, RunVisualStatus> = {
  approval: "pending_approval",
  input: "needs_input",
  reconnect: "paused",
  failed: "failed",
  billing: "paused",
  quota: "paused",
};

const KIND_HEADING: Record<AttentionKind, string> = {
  approval: "承認待ち",
  input: "入力待ち",
  reconnect: "連携の確認",
  failed: "失敗・修復",
  billing: "課金・利用枠",
  quota: "利用枠",
};

const KIND_ICON: Record<AttentionKind, string> = {
  approval: "✓",
  input: "✎",
  reconnect: "↻",
  failed: "!",
  billing: "¥",
  quota: "#",
};

export type AttentionCardProps = {
  kind: AttentionKind;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  meta?: string | null;
  detailLines?: string[];
  className?: string;
  onOpen?: () => void;
};

export function AttentionCard({
  kind,
  title,
  description,
  href,
  actionLabel,
  meta,
  detailLines,
  className,
  onOpen,
}: AttentionCardProps) {
  return (
    <article
      className={cn(
        "rounded-[var(--radius-lg)] border p-4 shadow-[var(--shadow-sm)]",
        kind === "approval" &&
          "border-[color-mix(in_srgb,var(--status-pending-approval)_45%,var(--border))] bg-[var(--status-pending-approval-bg)]",
        kind === "input" &&
          "border-[color-mix(in_srgb,var(--status-needs-input)_45%,var(--border))] bg-[var(--status-needs-input-bg)]",
        kind === "failed" &&
          "border-[color-mix(in_srgb,var(--status-failed)_45%,var(--border))] bg-[var(--status-failed-bg)]",
        (kind === "reconnect" || kind === "billing" || kind === "quota") &&
          "border-[color-mix(in_srgb,var(--warning)_40%,var(--border))] bg-[var(--warning-bg)]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            kind === "approval" &&
              "bg-[var(--status-pending-approval)] text-white",
            kind === "input" && "bg-[var(--status-needs-input)] text-white",
            kind === "failed" && "bg-[var(--status-failed)] text-white",
            (kind === "reconnect" || kind === "billing" || kind === "quota") &&
              "bg-[var(--warning)] text-white",
          )}
        >
          {KIND_ICON[kind]}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[length:var(--text-label)] font-semibold tracking-wide text-[var(--text-secondary)]">
              {KIND_HEADING[kind]}
            </p>
            <StatusBadge status={KIND_STATUS[kind]} />
          </div>
          <h3 className="text-[length:var(--text-card-title)] font-semibold text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="text-[length:var(--text-body)] text-[var(--text-secondary)]">
            {description}
          </p>
          {detailLines?.map((line) => (
            <p
              key={line}
              className="text-[length:var(--text-caption)] text-[var(--text-muted)]"
            >
              {line}
            </p>
          ))}
          {meta ? (
            <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {meta}
            </p>
          ) : null}
          <div className="pt-2">
            <Link
              href={href}
              onClick={onOpen}
              className={cn(
                "inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius-md)] px-4 text-sm font-semibold",
                kind === "failed"
                  ? "bg-[var(--status-failed)] text-white"
                  : "bg-[var(--brand)] text-[var(--brand-foreground)]",
              )}
            >
              {actionLabel}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
