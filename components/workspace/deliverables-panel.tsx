"use client";

import type { Deliverable } from "@/lib/deliverables/types";
import { DELIVERABLE_FORMAT_LABELS } from "@/lib/deliverables/types";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

type DeliverablesPanelProps = {
  deliverables: Deliverable[];
  isGenerating: boolean;
  error: string | null;
  matchedRule: string | null;
};

export function DeliverablesPanel({
  deliverables,
  isGenerating,
  error,
}: DeliverablesPanelProps) {
  if (!isGenerating && deliverables.length === 0 && !error) {
    return null;
  }

  return (
    <section className="space-y-8 animate-fade-in" aria-labelledby="deliverables-heading">
      <h2 id="deliverables-heading" className="text-title text-foreground">
        {ui.work.deliverables}
      </h2>

      {isGenerating && (
        <p className="animate-soft-pulse text-body">{ui.work.preparingFiles}</p>
      )}

      {error && <ErrorState message={error} />}

      <div className="space-y-6">
        {deliverables.map((item) => (
          <Card key={item.id} padding="lg">
            <div className="rounded-[var(--radius-xl)] bg-[var(--background-subtle)] px-6 py-12 text-center">
              <p className="text-sm text-[var(--foreground-muted)]">
                {DELIVERABLE_FORMAT_LABELS[item.format]}
              </p>
              <p className="mt-2 text-base font-medium text-foreground truncate">
                {item.fileName}
              </p>
            </div>

            <a href={item.downloadUrl} download={item.fileName} className="mt-6 block">
              <Button variant="primary" size="lg" className="w-full">
                {ui.actions.download}
              </Button>
            </a>
          </Card>
        ))}
      </div>
    </section>
  );
}
