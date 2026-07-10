"use client";

import { useEffect, useState } from "react";

import type { MonthlyCostSavingsSummary } from "@/lib/cost-optimization/cost-savings-tracker";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

async function fetchCostSavingsSummary(): Promise<MonthlyCostSavingsSummary | null> {
  try {
    const response = await fetch("/api/cost-optimization/summary", {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as MonthlyCostSavingsSummary;
  } catch {
    return null;
  }
}

export function CostSavingsPanel() {
  const [summary, setSummary] = useState<MonthlyCostSavingsSummary | null>(null);

  useEffect(() => {
    void fetchCostSavingsSummary().then(setSummary);
  }, []);

  if (!summary) return null;

  const hasActivity = summary.ecoRunCount > 0 || summary.reductionPercent > 0;
  if (!hasActivity) return null;

  return (
    <Card padding="lg" className="border-emerald-500/20 bg-emerald-500/5">
      <p className="text-caption text-emerald-800">{ui.costOptimization.savingsTitle}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">
        {ui.costOptimization.savingsMessage(summary.reductionPercent)}
      </p>
      {summary.cacheHitCount > 0 && (
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          {ui.costOptimization.cacheHits(summary.cacheHitCount)}
        </p>
      )}
    </Card>
  );
}
