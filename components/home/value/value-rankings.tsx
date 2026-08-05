"use client";

import Link from "next/link";

import type { ValueHomeSnapshot } from "@/lib/value";

function RankingBlock({
  title,
  items,
}: {
  title: string;
  items: ValueHomeSnapshot["rankings"]["automations"];
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      <ol className="space-y-1.5">
        {items.map((item, index) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-muted)]"
            >
              <span className="tabular-nums text-[var(--text-muted)]">
                {index + 1}.
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {item.title}
              </span>
              <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                {item.valueLabel}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ValueRankings({ snapshot }: { snapshot: ValueHomeSnapshot }) {
  return (
    <section
      aria-labelledby="value-rankings-heading"
      className="space-y-4"
      data-testid="value-rankings"
    >
      <h2
        id="value-rankings-heading"
        className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
      >
        ランキング
      </h2>
      <div className="grid gap-5 sm:grid-cols-2">
        <RankingBlock title="自動化ランキング" items={snapshot.rankings.automations} />
        <RankingBlock title="節約時間ランキング" items={snapshot.rankings.timeSaved} />
        <RankingBlock title="成果物ランキング" items={snapshot.rankings.deliverables} />
        <RankingBlock title="Memory利用ランキング" items={snapshot.rankings.memory} />
      </div>
    </section>
  );
}
