"use client";

import type { ValueHomeSnapshot } from "@/lib/value";

export function ValueHero({ snapshot }: { snapshot: ValueHomeSnapshot }) {
  const { hero } = snapshot;
  return (
    <section
      aria-labelledby="value-hero-heading"
      className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 sm:p-6"
      data-testid="value-hero"
    >
      <p className="text-xs font-semibold tracking-wide text-[var(--brand)]">
        今日あなたが削減した仕事
      </p>
      <h2
        id="value-hero-heading"
        className="mt-2 text-xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-2xl"
      >
        AIが終わらせた仕事 {hero.jobsCompleted}件
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-[var(--text-muted)]">削減時間</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">
            {hero.hoursSavedLabel}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">成果物</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">
            {hero.deliverableCount}件
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">自動化成功率</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">
            {hero.successRatePercent == null ? "—" : `${hero.successRatePercent}%`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">完了した仕事</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">
            {hero.jobsCompleted}件
          </dd>
        </div>
      </dl>
    </section>
  );
}
