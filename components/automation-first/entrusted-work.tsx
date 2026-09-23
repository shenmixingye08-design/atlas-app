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
      className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
    >
      {NEW_USER_VALUE_STEPS.map((step, index) => (
        <li
          key={step.id}
          className="ui-card flex items-start gap-3 px-4 py-3.5 sm:flex-col sm:gap-2"
        >
          <span
            aria-hidden
            className="ui-icon-tile h-7 w-7 rounded-lg text-[length:var(--text-label)] font-bold"
          >
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--text-primary)]">
              {step.title}
            </span>
            <span className="mt-0.5 block text-[length:var(--text-caption)] leading-relaxed text-[var(--text-secondary)]">
              {step.body}
            </span>
          </span>
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
      <ul className="ui-card ui-list">
        {cards.map((card) => (
          <li key={card.id}>
            <Link
              href={card.href}
              className="ui-row ui-row-link focus-ring min-h-[var(--touch-target)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                  {card.title}
                </span>
                <span className="block text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {card.detail}
                </span>
              </span>
              <span className="shrink-0 text-[length:var(--text-label)] font-semibold text-[var(--brand)]">
                続きをやる
              </span>
              <span aria-hidden className="ui-chevron">›</span>
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
      className="ui-card ui-card-pad"
    >
      <h3
        id="af-value-metrics-heading"
        className="text-[length:var(--text-label)] font-semibold text-[var(--text-primary)]"
      >
        計測できた実績
      </h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
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
