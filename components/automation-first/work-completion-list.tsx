"use client";

import Link from "next/link";

import type { WorkCompletionItem } from "@/lib/first-value/work-completion";
import { trackAutomationFirstEvent } from "@/lib/automation-first/analytics";
import { SectionHeader } from "@/components/automation-first/page-header";

export function WorkCompletionList({
  items,
}: {
  items: WorkCompletionItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="work-completion-heading" className="space-y-3">
      <SectionHeader title="仕事完了一覧" />
      <p id="work-completion-heading" className="sr-only">
        仕事完了一覧
      </p>
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--text-primary)]">
                  {item.title}
                </p>
                {item.completedAtLabel ? (
                  <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {item.completedAtLabel}
                  </p>
                ) : null}
              </div>
              <Link
                href={item.href}
                onClick={() =>
                  trackAutomationFirstEvent("artifact_opened", {
                    id: item.id,
                    source: "work_completion_list",
                  })
                }
                className="shrink-0 text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
              >
                結果を見る
              </Link>
            </div>
            <ul className="mt-3 space-y-1.5">
              {item.steps.map((step) => (
                <li
                  key={step.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-[var(--text-secondary)]">{step.label}</span>
                  <span className="font-medium text-emerald-700">
                    {step.status === "completed"
                      ? "完了"
                      : step.status === "failed"
                        ? "失敗"
                        : "待機"}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
