"use client";

import Link from "next/link";
import { useEffect } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function BillingCancelPage() {
  useEffect(() => {
    void fetch("/api/growth/revenue-max", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "checkout_abandoned" }),
    }).catch(() => undefined);
  }, []);

  return (
    <AtlasAppShell active="settings" width="default">
      <Card padding="lg" className="mx-auto max-w-lg text-center shadow-[var(--shadow-soft)]">
        <h1 className="text-title text-foreground">{ui.billing.cancelTitle}</h1>
        <p className="mt-3 text-body text-[var(--foreground-muted)]">
          {ui.billing.checkoutCancelledBanner}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/settings/billing">
            <Button>{ui.billing.backToBilling}</Button>
          </Link>
          <Link href="/projects">
            <Button variant="ghost">{ui.nav.home}</Button>
          </Link>
        </div>
      </Card>
    </AtlasAppShell>
  );
}
