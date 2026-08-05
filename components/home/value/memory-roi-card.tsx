"use client";

import Link from "next/link";

import type { ValueHomeSnapshot } from "@/lib/value";

export function MemoryRoiCard({ snapshot }: { snapshot: ValueHomeSnapshot }) {
  const { memoryRoi } = snapshot;
  return (
    <section
      aria-labelledby="memory-roi-heading"
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
      data-testid="memory-roi-card"
    >
      <h2
        id="memory-roi-heading"
        className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
      >
        Memoryの効果
      </h2>
      <p className="mt-2 text-sm text-[var(--text-primary)]">{memoryRoi.summary}</p>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        適用 {memoryRoi.applyCount}回 · 修正量 −{memoryRoi.revisionReductionPercent}%
      </p>
      <Link
        href="/settings/memory"
        className="mt-3 inline-flex text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
      >
        好みを確認する
      </Link>
    </section>
  );
}
