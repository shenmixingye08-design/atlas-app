"use client";

import Link from "next/link";

import { FIRST_VALUE_CANDIDATES, trackFirstValueEvent } from "@/lib/first-value";

/** Empty home — never blank. Offer first job candidates. */
export function EmptyFirstJob() {
  return (
    <section
      aria-labelledby="fv-empty-heading"
      className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-5 py-8"
    >
      <h2
        id="fv-empty-heading"
        className="text-center text-lg font-semibold text-[var(--text-primary)]"
      >
        最初の仕事をAIへ任せる
      </h2>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-[var(--text-secondary)]">
        15分以内に、成果物の完成・保存・通知・ダウンロードまでご体験いただけます。
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {FIRST_VALUE_CANDIDATES.map((c) => (
          <Link
            key={c.id}
            href={`/automations/quick-start?candidate=${encodeURIComponent(c.id)}`}
            onClick={() =>
              trackFirstValueEvent("first_value_candidate_selected", {
                candidateId: c.id,
                source: "home_empty",
              })
            }
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:border-[var(--brand)]"
          >
            {c.label}
          </Link>
        ))}
      </div>
      <div className="mt-6 flex justify-center">
        <Link
          href="/automations/quick-start"
          onClick={() =>
            trackFirstValueEvent("first_automation_started", {
              source: "home_empty_primary",
            })
          }
          className="inline-flex min-h-[48px] items-center rounded-[var(--radius-md)] bg-[var(--brand)] px-5 text-sm font-semibold text-[var(--brand-foreground)]"
        >
          最初の仕事をはじめる
        </Link>
      </div>
    </section>
  );
}
