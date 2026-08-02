"use client";

import type { MemoryApplyPreviewItem } from "@/lib/personal-memory/types";

export function MemoryApplyPreview({
  items,
  className,
}: {
  items: MemoryApplyPreviewItem[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section
      className={
        className ??
        "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3"
      }
      aria-label="今回適用する好み"
    >
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        今回は以下の好みを適用します
      </p>
      <ul className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
        {items.map((item) => (
          <li key={`${item.memoryId ?? "x"}-${item.scope}-${item.summary}`}>
            ・{item.title}: {item.summary}
          </li>
        ))}
      </ul>
    </section>
  );
}
