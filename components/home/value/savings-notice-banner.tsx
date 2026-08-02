"use client";

import { useMemo } from "react";

import { loadLatestValueSavingsNotice } from "@/lib/value";

export function SavingsNoticeBanner({
  fallbackMinutes,
}: {
  fallbackMinutes: number;
}) {
  const notice = useMemo(() => {
    const stored = loadLatestValueSavingsNotice();
    if (stored) return stored.message;
    if (fallbackMinutes > 0) {
      const hours = Math.floor(fallbackMinutes / 60);
      const rem = fallbackMinutes % 60;
      const label =
        hours > 0 ? (rem > 0 ? `${hours}時間${rem}分` : `${hours}時間`) : `${rem}分`;
      return `今日は${label}節約しました`;
    }
    return null;
  }, [fallbackMinutes]);

  if (!notice) return null;

  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-primary)]"
      data-testid="savings-notice-banner"
      role="status"
    >
      {notice}
    </div>
  );
}
