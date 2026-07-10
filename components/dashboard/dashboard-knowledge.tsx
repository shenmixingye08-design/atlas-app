import type { KnowledgeEntry } from "@/lib/knowledge/types";
import type { KnowledgeGrowthPoint } from "@/lib/dashboard/types";
import { ui } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type DashboardKnowledgeProps = {
  recent: KnowledgeEntry[];
  reused: KnowledgeEntry[];
  growth: KnowledgeGrowthPoint[];
};

export function DashboardKnowledge({
  recent,
  reused,
  growth,
}: DashboardKnowledgeProps) {
  const maxCount = Math.max(1, ...growth.map((g) => g.count));

  return (
    <section aria-labelledby="knowledge-heading">
      <h2 id="knowledge-heading" className="text-title text-foreground">
        {ui.knowledge.title}
      </h2>
      <p className="mt-1 text-caption">{ui.knowledge.subtitle}</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card variant="elevated" padding="md" className="lg:col-span-1">
          <h3 className="text-sm font-semibold text-foreground">
            {ui.knowledge.recentlyLearned}
          </h3>
          <ul className="mt-4 space-y-3">
            {recent.length === 0 ? (
              <li className="text-caption">{ui.knowledge.noEntries}</li>
            ) : (
              recent.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-3 py-2 ring-1 ring-[var(--border)]"
                >
                  <p className="text-sm font-medium text-foreground truncate">
                    {entry.title}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="default">{entry.category}</Badge>
                  </div>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card variant="elevated" padding="md" className="lg:col-span-1">
          <h3 className="text-sm font-semibold text-foreground">
            {ui.knowledge.mostReused}
          </h3>
          <ul className="mt-4 space-y-3">
            {reused.length === 0 ? (
              <li className="text-caption">{ui.knowledge.noEntries}</li>
            ) : (
              reused.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-3 py-2 ring-1 ring-[var(--border)]"
                >
                  <p className="text-sm font-medium text-foreground truncate">
                    {entry.title}
                  </p>
                  <p className="mt-1 text-caption">
                    {ui.knowledge.confidence(entry.confidence)}
                  </p>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card variant="elevated" padding="md" className="lg:col-span-1">
          <h3 className="text-sm font-semibold text-foreground">
            {ui.knowledge.growth}
          </h3>
          <div
            className="mt-6 flex h-32 items-end justify-between gap-2"
            role="img"
            aria-label={ui.knowledge.growth}
          >
            {growth.map((point) => (
              <div
                key={point.label}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div
                  className="w-full rounded-t-[var(--radius-sm)] bg-gradient-to-t from-accent/80 to-accent/30 transition-all duration-[var(--motion-slow)]"
                  style={{
                    height: `${Math.max(8, (point.count / maxCount) * 100)}%`,
                  }}
                />
                <span className="text-[10px] text-[var(--foreground-subtle)]">
                  {point.label}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
