"use client";

import Link from "next/link";
import { useState } from "react";

import { SectionHeader } from "@/components/automation-first/page-header";
import { runAutomationNow, setAutomationEnabled } from "@/lib/automations/client";
import { YOUR_WORK_HEADING } from "@/lib/work-asset/messaging";
import type { WorkAsset } from "@/lib/work-asset/work-view";

const LIFECYCLE_LABEL: Record<WorkAsset["lifecycle"], string> = {
  active: "稼働中",
  paused: "一時停止",
  needs_attention: "要確認",
  completed: "完了",
  failed: "失敗",
};

export function YourWorkList({
  works,
  onChanged,
}: {
  works: WorkAsset[];
  onChanged?: () => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  if (works.length === 0) return null;

  async function pauseOrResume(work: WorkAsset) {
    setPendingId(work.id);
    try {
      await setAutomationEnabled(work.id, work.lifecycle === "paused");
      onChanged?.();
    } finally {
      setPendingId(null);
    }
  }

  async function runNow(work: WorkAsset) {
    setPendingId(work.id);
    try {
      await runAutomationNow(work.id);
      onChanged?.();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section
      aria-labelledby="af-your-work-heading"
      data-testid="your-work"
      className="space-y-2.5"
    >
      <SectionHeader
        heading="h3"
        title={YOUR_WORK_HEADING}
        description="これからもMINERVOTに任せる仕事。履歴とは別です"
      />
      <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)]">
        {works.map((work) => (
          <li key={work.id} className="space-y-2 px-3.5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {work.name}
              </p>
              <p className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
                {LIFECYCLE_LABEL[work.lifecycle]}
                {work.nextRunAt ? ` · 次回 ${work.nextRunAt}` : ""}
                {work.lastSuccessAt && !work.nextRunAt
                  ? ` · 前回 ${work.lastSuccessAt}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={work.href}
                className="inline-flex min-h-[var(--touch-target)] items-center rounded-full border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text-primary)]"
              >
                詳細
              </Link>
              {work.lifecycle === "active" ? (
                <button
                  type="button"
                  disabled={pendingId === work.id}
                  onClick={() => void runNow(work)}
                  className="inline-flex min-h-[var(--touch-target)] items-center rounded-full border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text-primary)]"
                >
                  今すぐ実行
                </button>
              ) : null}
              {work.lifecycle === "active" || work.lifecycle === "paused" ? (
                <button
                  type="button"
                  disabled={pendingId === work.id}
                  onClick={() => void pauseOrResume(work)}
                  className="inline-flex min-h-[var(--touch-target)] items-center rounded-full border border-[var(--border)] px-3 text-sm font-semibold text-[var(--brand)]"
                >
                  {work.lifecycle === "paused" ? "再開" : "一時停止"}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WorkCountStrip({
  entrusted,
  completedThisWeek,
  needsAttention,
}: {
  entrusted: number;
  completedThisWeek: number | null;
  needsAttention: number;
}) {
  const items: { label: string; count: number }[] = [];
  if (entrusted > 0) items.push({ label: "MINERVOTに任せている仕事", count: entrusted });
  if (completedThisWeek != null && completedThisWeek > 0) {
    items.push({ label: "今週自動完了", count: completedThisWeek });
  }
  if (needsAttention > 0) items.push({ label: "対応が必要", count: needsAttention });
  if (items.length === 0) return null;
  return (
    <dl
      data-testid="work-count-strip"
      className="grid grid-cols-1 gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3.5 sm:grid-cols-3"
    >
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
            {item.label}
          </dt>
          <dd className="text-base font-semibold tabular-nums">{item.count}件</dd>
        </div>
      ))}
    </dl>
  );
}
