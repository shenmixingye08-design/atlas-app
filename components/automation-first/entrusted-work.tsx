"use client";

import Link from "next/link";

import { SectionHeader } from "@/components/automation-first/page-header";
import type { EntrustedWorkCard } from "@/lib/value-moat/home-entrusted";
import type { ValueMetric } from "@/lib/value-moat/value-metrics";
import { NEW_USER_VALUE_STEPS } from "@/lib/value-moat/messaging";

export function NewUserValueSteps() {
  return (
    <ol
      data-testid="new-user-value-steps"
      className="grid grid-cols-1 gap-2.5"
    >
      {NEW_USER_VALUE_STEPS.map((step, index) => (
        <li
          key={step.id}
          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3.5 py-3"
        >
          <p className="text-[length:var(--text-meta)] font-semibold text-[var(--brand)]">
            {index + 1}. {step.title}
          </p>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function EntrustedWorkList({ cards }: { cards: EntrustedWorkCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section
      aria-labelledby="af-entrusted-heading"
      data-testid="entrusted-work"
      className="space-y-2.5"
    >
      <SectionHeader
        heading="h3"
        title="MINERVOTに任せた仕事"
        description="実データのみ。デモ履歴は出しません"
      />
      <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)]">
        {cards.map((card) => (
          <li
            key={card.id}
            className="flex items-center justify-between gap-3 px-3.5 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {card.title}
              </p>
              <p className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
                {card.detail}
              </p>
            </div>
            <Link
              href={card.href}
              className="inline-flex min-h-[var(--touch-target)] shrink-0 items-center text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
            >
              続きをやる
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MeasuredValueMetrics({ metrics }: { metrics: ValueMetric[] }) {
  if (metrics.length === 0) return null;
  return (
    <section
      aria-labelledby="af-value-metrics-heading"
      data-testid="value-metrics"
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3.5"
    >
      <h3
        id="af-value-metrics-heading"
        className="text-[length:var(--text-label)] font-semibold text-[var(--text-primary)]"
      >
        計測できた実績
      </h3>
      <dl className="mt-2.5 grid grid-cols-2 gap-2.5 text-sm sm:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.id}>
            <dt className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
              {metric.label}
            </dt>
            <dd className="text-base font-semibold tabular-nums">{metric.count}件</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
