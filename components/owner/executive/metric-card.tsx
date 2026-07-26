import { Card } from "@/components/ui/card";
import { cn } from "@/lib/design-system/cn";
import type { ExecutiveKpiCard } from "@/lib/owner/executive";

export function ExecutiveMetricCard({
  card,
  index = 0,
}: {
  card: ExecutiveKpiCard;
  index?: number;
}) {
  const accentClasses = {
    default: "border-[var(--border)] bg-[var(--card)]",
    revenue: "border-[var(--success)]/20 bg-[var(--success-bg)]",
    cost: "border-[var(--error)]/20 bg-[var(--error-bg)]",
    profit: "border-[var(--accent)]/20 bg-[var(--accent-muted)]",
  } as const;

  return (
    <Card
      padding="lg"
      className={cn(
        "owner-card-enter border shadow-none transition-transform duration-300 hover:-translate-y-0.5",
        accentClasses[card.accent],
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <p className="text-sm text-[var(--text-secondary)]">{card.label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {card.value}
      </p>
      {(card.hint || card.statusMessage) && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {card.statusMessage ?? card.hint}
        </p>
      )}
    </Card>
  );
}
