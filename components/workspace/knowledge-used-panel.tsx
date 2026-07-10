"use client";

import type { KnowledgeUsedResult } from "@/lib/knowledge/types";
import { ui } from "@/lib/i18n";

const REFERENCE_CATEGORIES = new Set([
  "project_summary",
  "deliverable",
  "reusable_strategy",
  "company_learning",
  "user_feedback",
  "lesson_learned",
]);

const CATEGORY_LABELS: Record<string, string> = {
  project_summary: "プロジェクト",
  deliverable: "成果物",
  reusable_strategy: "成功戦略",
  company_learning: "社内ナレッジ",
  user_feedback: "フィードバック",
  lesson_learned: "教訓",
};

type KnowledgeUsedPanelProps = {
  knowledge: KnowledgeUsedResult | undefined;
};

export function KnowledgeUsedPanel({ knowledge }: KnowledgeUsedPanelProps) {
  const referenceEntries =
    knowledge?.retrieval.entries.filter((entry) => REFERENCE_CATEGORIES.has(entry.category)) ??
    [];

  if (referenceEntries.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-overline">参考ナレッジ</h2>
        <span className="rounded-full bg-[var(--accent-muted)] px-2.5 py-1 text-xs text-accent">
          {ui.knowledge.entriesReferenced(referenceEntries.length)}
        </span>
      </div>

      <div className="rounded-[var(--radius-xl)] bg-[var(--card)] p-4 shadow-[var(--shadow-md)] sm:p-5">
        <ul className="space-y-2">
          {referenceEntries.map((entry) => (
            <li key={entry.id} className="atlas-surface-subtle px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{entry.title}</span>
                <span className="rounded-full bg-[var(--card)] px-2 py-0.5 text-[10px] text-[var(--foreground-muted)] ring-1 ring-[var(--border)]">
                  {CATEGORY_LABELS[entry.category] ?? entry.category}
                </span>
                <span className="text-[10px] text-[var(--foreground-subtle)]">
                  {ui.knowledge.confidence(Math.round(entry.confidence))}
                </span>
              </div>
              <p className="mt-1 text-caption">{entry.summary}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
