import type { Metadata } from "next";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { HouseholdLedgerView } from "@/components/receipt/household-ledger-view";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.metadata.household,
  description: ui.household.subtitle,
};

export default function HouseholdPage() {
  return (
    <AtlasAppShell active="history" width="default">
      <div className="space-y-8 animate-fade-up">
        <header className="space-y-3">
          <p className="text-caption">{ui.brand}</p>
          <h1 className="text-display text-foreground">{ui.household.title}</h1>
          <p className="text-body max-w-2xl text-[var(--foreground-muted)]">
            {ui.household.subtitle}
          </p>
        </header>
        <HouseholdLedgerView />
      </div>
    </AtlasAppShell>
  );
}
