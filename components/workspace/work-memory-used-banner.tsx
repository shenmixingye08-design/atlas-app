"use client";

import { useState } from "react";

import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import {
  formatWorkMemoryConfidence,
  getWorkMemoryTypeLabel,
  type WorkMemorySummary,
} from "@/lib/work-memory";

type WorkMemoryUsedBannerProps = {
  used: WorkMemorySummary[];
  className?: string;
};

export function WorkMemoryUsedBanner({
  used,
  className,
}: WorkMemoryUsedBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (used.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--background-subtle)] px-4 py-3 text-sm",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 text-left text-[var(--text-secondary)] hover:text-foreground"
        aria-expanded={expanded}
      >
        <span>{ui.workMemory.usedBanner}</span>
        <span className="text-xs text-[var(--text-muted)]">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <ul className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-3">
          {used.map((memory) => (
            <li key={memory.id} className="text-sm">
              <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                {getWorkMemoryTypeLabel(memory.type)}
              </span>
              <p className="mt-1 font-medium text-foreground">{memory.title}</p>
              <p className="text-[var(--text-secondary)]">{memory.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WorkMemoryCandidateBanner({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;

  return (
    <p className={cn("text-sm text-[var(--text-secondary)]", className)}>
      {ui.workMemory.confirmPrompt}{" "}
      <a href="/settings/work-memory" className="text-accent hover:underline">
        {ui.workMemory.settingsLinkTitle}
      </a>
      {" "}（{count}件）
    </p>
  );
}
