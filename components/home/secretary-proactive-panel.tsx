"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { SecretaryProactiveItem } from "@/lib/home/secretary-proactive";
import {
  isProactiveSuggestionVisible,
  snoozeProactiveSuggestion,
} from "@/lib/proactive-suggestions";

type SecretaryProactivePanelProps = {
  items: SecretaryProactiveItem[];
};

export function SecretaryProactivePanel({ items }: SecretaryProactivePanelProps) {
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          !hiddenIds.includes(item.id) && isProactiveSuggestionVisible(item.id),
      ),
    [hiddenIds, items],
  );

  const handleLater = (id: string) => {
    snoozeProactiveSuggestion(id);
    setHiddenIds((prev) => [...prev, id]);
  };

  return (
    <section
      aria-labelledby="secretary-proactive-heading"
      className="animate-fade-up rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-md)] sm:p-6"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"
          aria-hidden
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
            <path
              d="M12 3v3M12 18v3M3 12h3M18 12h3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
        <div>
          <h2
            id="secretary-proactive-heading"
            className="text-base font-semibold tracking-tight text-foreground sm:text-lg"
          >
            AI秘書からの提案
          </h2>
          <p className="text-xs text-[var(--foreground-muted)] sm:text-sm">
            先回りして、次の一手をご用意しました
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-5 animate-fade-in text-sm leading-relaxed text-foreground sm:text-base">
          今日は何から始めますか？
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {visible.map((item, index) => (
            <li
              key={item.id}
              className="animate-fade-up rounded-[22px] border border-[var(--border-subtle)] bg-[var(--background-subtle)]/55 px-4 py-4 sm:px-5"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <p className="text-sm font-semibold text-foreground sm:text-[15px]">
                {item.title}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                {item.description}
              </p>
              <p className="mt-2 text-xs font-medium text-accent">{item.reason}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  variant="primary"
                  size="sm"
                  className="rounded-full"
                  onClick={() => router.push(item.continueHref)}
                >
                  続きを行う
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-full"
                  onClick={() => router.push(item.confirmHref)}
                >
                  確認する
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={() => handleLater(item.id)}
                >
                  あとで
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
