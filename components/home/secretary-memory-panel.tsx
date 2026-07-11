"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { SecretaryMemoryItem } from "@/lib/home/secretary-memory";

type SecretaryMemoryPanelProps = {
  items: SecretaryMemoryItem[];
};

export function SecretaryMemoryPanel({ items }: SecretaryMemoryPanelProps) {
  const router = useRouter();

  return (
    <section
      aria-labelledby="secretary-memory-heading"
      className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)] sm:p-6"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--background-subtle)] text-accent"
          aria-hidden
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
            <path
              d="M12 3a4 4 0 0 1 4 4v1.1A5 5 0 0 1 19 13v2l1.2 1.8a1 1 0 0 1-.85 1.5H4.65a1 1 0 0 1-.85-1.5L5 15v-2a5 5 0 0 1 3-4.6V7a4 4 0 0 1 4-4Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M9.5 19.5a2.5 2.5 0 0 0 5 0"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div>
          <h2
            id="secretary-memory-heading"
            className="text-base font-semibold tracking-tight text-foreground sm:text-lg"
          >
            AI秘書から
          </h2>
          <p className="text-xs text-[var(--foreground-muted)] sm:text-sm">
            以前の仕事を覚えています
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-5 text-sm leading-relaxed text-foreground sm:text-base">
          今日は何から始めますか？
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--background-subtle)]/50 px-4 py-4 sm:px-5"
            >
              <p className="text-sm leading-relaxed text-foreground sm:text-[15px]">
                {item.message}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  variant="primary"
                  size="sm"
                  className="rounded-full"
                  onClick={() => router.push(item.continueHref)}
                >
                  続きを実行
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-full"
                  onClick={() => router.push(item.confirmHref)}
                >
                  確認する
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
