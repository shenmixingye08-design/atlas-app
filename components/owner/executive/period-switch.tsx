"use client";

import Link from "next/link";

import { cn } from "@/lib/design-system/cn";
import type { ExecutivePeriod } from "@/lib/owner/executive";

const OPTIONS: { id: ExecutivePeriod; label: string }[] = [
  { id: "today", label: "日別" },
  { id: "week", label: "週別" },
  { id: "month", label: "月別" },
  { id: "year", label: "年別" },
];

export function ExecutivePeriodSwitch({
  period,
  basePath = "/owner/analytics",
}: {
  period: ExecutivePeriod;
  basePath?: string;
}) {
  return (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-muted)] p-1">
      {OPTIONS.map((option) => (
        <Link
          key={option.id}
          href={`${basePath}?period=${option.id}`}
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
