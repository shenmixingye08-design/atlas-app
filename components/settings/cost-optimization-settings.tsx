"use client";

import { useEffect, useState } from "react";

import type { AutomationExecutionMode, JobCategoryId } from "@/lib/cost-optimization";
import {
  JOB_CATEGORY_IDS,
  defaultCategoryExecutionModes,
  loadCategoryExecutionModes,
  saveCategoryExecutionModes,
  type CategoryExecutionModeDefaults,
} from "@/lib/cost-optimization";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

import { ExecutionModeSelector } from "@/components/automations/execution-mode-selector";

const CATEGORY_LABELS: Record<JobCategoryId, string> = {
  blog: ui.costOptimization.categories.blog,
  sns: ui.costOptimization.categories.sns,
  sales_material: ui.costOptimization.categories.salesMaterial,
  email: ui.costOptimization.categories.email,
  generic: ui.costOptimization.categories.generic,
};

export function CostOptimizationSettings() {
  const [modes, setModes] = useState<CategoryExecutionModeDefaults>(
    defaultCategoryExecutionModes,
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setModes(loadCategoryExecutionModes());
  }, []);

  const handleChange = (category: JobCategoryId, mode: AutomationExecutionMode) => {
    const next = { ...modes, [category]: mode };
    setModes(next);
    saveCategoryExecutionModes(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <section aria-labelledby="cost-optimization-settings-heading" className="space-y-4">
      <div>
        <h2 id="cost-optimization-settings-heading" className="text-title text-foreground">
          {ui.costOptimization.settingsTitle}
        </h2>
        <p className="mt-1 text-caption text-[var(--foreground-muted)]">
          {ui.costOptimization.settingsHint}
        </p>
        {saved && (
          <p className="mt-2 text-sm text-[var(--status-success)]">
            {ui.costOptimization.saved}
          </p>
        )}
      </div>

      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        <ul className="divide-y divide-[var(--border-subtle)]">
          {JOB_CATEGORY_IDS.filter((id) => id !== "generic").map((category) => (
            <li
              key={category}
              className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{CATEGORY_LABELS[category]}</p>
              </div>
              <ExecutionModeSelector
                compact
                value={modes[category]}
                onChange={(mode) => handleChange(category, mode)}
              />
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
