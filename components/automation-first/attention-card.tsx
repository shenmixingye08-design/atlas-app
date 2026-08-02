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

export type AttentionCardProps = {
  kind: AttentionKind;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  className?: string;
  onOpen?: () => void;
};

export function AttentionCard({
  kind,
  title,
  description,
  href,
  actionLabel,
  className,
  onOpen,
}: AttentionCardProps) {
  return (
    <article
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <StatusBadge status={KIND_STATUS[kind]} />
          <h3 className="text-[length:var(--text-card-title)] font-semibold text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {description}
          </p>
        </div>
        <Link
          href={href}
          onClick={onOpen}
          className="inline-flex min-h-[var(--touch-target)] shrink-0 items-center rounded-[var(--radius-md)] bg-[var(--brand)] px-3 text-sm font-semibold text-[var(--brand-foreground)]"
        >
          {actionLabel}
        </Link>
      </div>
    </article>
  );
}
