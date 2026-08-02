"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  buildHomeBootstrapItems,
  trackRetentionEvent,
} from "@/lib/retention";

export function HomeBootstrapPanel() {
  const items = useMemo(() => buildHomeBootstrapItems(), []);

  return (
    <section
      aria-labelledby="retention-bootstrap-heading"
      className="space-y-3"
      data-testid="retention-home-bootstrap"
    >
      <div>
        <h2
          id="retention-bootstrap-heading"
          className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
        >
          今日から仕事を終わらせる
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          空のホームにはしません。おすすめ仕事・今すぐ作れる成果物・人気Automationです。
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              onClick={() =>
                trackRetentionEvent("retention_home_bootstrap_clicked", {
                  id: item.id,
                  kind: item.kind,
                })
              }
              className="flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-4 transition-colors hover:bg-[var(--surface-muted)]"
            >
              <p className="text-xs font-medium tracking-wide text-[var(--brand)]">
                {item.kind === "recommended_work"
                  ? "おすすめ仕事"
                  : item.kind === "quick_deliverable"
                    ? "今すぐ作れる成果物"
                    : "人気Automation"}
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                {item.title === "おすすめの仕事" ||
                item.title === "今すぐ作れる成果物" ||
                item.title === "人気Automation"
                  ? item.description
                  : item.title}
              </p>
              <span className="mt-auto pt-3 text-sm font-semibold text-[var(--brand)]">
                {item.ctaLabel}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
