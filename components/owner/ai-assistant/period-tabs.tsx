"use client";

import Link from "next/link";

import { cn } from "@/lib/design-system/cn";
import type { AssistantPeriod } from "@/lib/owner/ai-assistant";

const OPTIONS: { id: AssistantPeriod; label: string }[] = [
  { id: "day", label: "毎日" },
  { id: "week", label: "毎週" },
  { id: "month", label: "毎月" },
];

export function AssistantPeriodTabs({ period }: { period: AssistantPeriod }) {
  return (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-muted)] p-1">
      {OPTIONS.map((option) => (
        <Link
          key={option.id}
          href={`/owner/ai-assistant?period=${option.id}`}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm transition-colors",
            period === option.id
              ? "bg-[var(--card)] font-medium text-foreground shadow-sm"
              : "text-[var(--text-secondary)] hover:text-foreground",
          )}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}
