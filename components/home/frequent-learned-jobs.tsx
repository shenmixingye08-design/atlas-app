"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  assignmentFromLearnedMemory,
  fetchWorkMemories,
  isTaughtWorkflowData,
  type WorkMemoryRecord,
} from "@/lib/work-memory";

export function FrequentLearnedJobs() {
  const router = useRouter();
  const [items, setItems] = useState<WorkMemoryRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchWorkMemories({ type: "template", activeOnly: true })
      .then((response) => {
        if (cancelled) return;
        const sorted = [...response.memories]
          .sort((a, b) => {
            if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
            const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
            const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
            return bTime - aTime;
          })
          .slice(0, 8);
        setItems(sorted);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="frequent-learned-jobs-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h2
          id="frequent-learned-jobs-heading"
          className="text-lg font-semibold tracking-tight text-foreground sm:text-xl"
        >
          よく使う仕事
        </h2>
        <Link
          href="/learned-jobs"
          className="text-sm text-accent transition-opacity hover:opacity-80"
        >
          すべて見る
        </Link>
      </div>
      <ul className="flex flex-wrap gap-2 sm:gap-3">
        {items.map((memory) => (
          <li key={memory.id}>
            <button
              type="button"
              onClick={() => {
                const assignment = assignmentFromLearnedMemory(memory);
                if (!assignment) return;
                const taught = isTaughtWorkflowData(memory.structuredData)
                  ? "&taught=1"
                  : "";
                router.push(
                  `/commander?assignment=${encodeURIComponent(assignment)}${taught}`,
                );
              }}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-2.5 text-sm font-medium text-foreground shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
            >
              {memory.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
