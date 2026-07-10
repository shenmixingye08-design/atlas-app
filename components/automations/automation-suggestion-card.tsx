"use client";

import Link from "next/link";

import type { AutomationFormState } from "@/lib/automations/form-utils";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type AutomationSuggestionCardProps = {
  message: string;
  formDefaults: AutomationFormState;
  onDismiss: () => void;
};

function buildPrefillQuery(formDefaults: AutomationFormState): string {
  const params = new URLSearchParams({
    create: "1",
    title: formDefaults.title,
    assignment: formDefaults.assignment,
    frequency: formDefaults.frequency,
    hour: String(formDefaults.hour),
    minute: String(formDefaults.minute),
    dayOfWeek: String(formDefaults.dayOfWeek),
    dayOfMonth: String(formDefaults.dayOfMonth),
  });
  return `/automations?${params.toString()}`;
}

export function AutomationSuggestionCard({
  message,
  formDefaults,
  onDismiss,
}: AutomationSuggestionCardProps) {
  return (
    <Card padding="md" className="border border-accent/20 bg-accent/5">
      <p className="text-sm font-medium text-accent">{ui.brand}</p>
      <p className="mt-2 text-sm leading-relaxed text-foreground">{message}</p>
      <p className="mt-1 text-caption text-[var(--foreground-muted)]">
        {ui.habits.chatSuggestionHint}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={buildPrefillQuery(formDefaults)}>
          <Button variant="primary" size="sm" type="button">
            {ui.habits.registerAction}
          </Button>
        </Link>
        <Button variant="secondary" size="sm" onClick={onDismiss}>
          {ui.habits.dismissSuggestion}
        </Button>
      </div>
    </Card>
  );
}
