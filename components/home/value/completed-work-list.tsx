"use client";

import Link from "next/link";

import { trackValueEvent, type ValueHomeSnapshot } from "@/lib/value";

export function CompletedWorkList({
  snapshot,
}: {
  snapshot: ValueHomeSnapshot;
}) {
  return (
    <section
      aria-labelledby="completed-work-heading"
      className="space-y-3"
      data-testid="completed-work-list"
    >
      <div>
        <h2
          id="completed-work-heading"
          className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
        >
          仕事完了一覧
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          成果物ファイル名ではなく、終わった仕事として表示します。
        </p>
      </div>
      {snapshot.completedWork.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--text-secondary)]">
          まだ完了した仕事はありません。最初の1件が終わると、ここに並びます。
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)]">
          {snapshot.completedWork.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                onClick={() =>
                  trackValueEvent("value_completed_work_opened", { id: item.id })
                }
                className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-muted)]"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--text-primary)]">
                    {item.title}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{item.detail}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-[var(--brand)]">
                  {item.statusLabel}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
