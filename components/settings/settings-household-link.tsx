"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";

export function SettingsHouseholdLink() {
  return (
    <Link href="/household" className="block focus-ring rounded-[var(--radius-xl)]">
      <Card padding="lg" className="transition-colors hover:border-accent/40">
        <p className="text-sm font-semibold text-foreground">
          {ui.household.title}
        </p>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          {ui.household.subtitle}
        </p>
      </Card>
    </Link>
  );
}
