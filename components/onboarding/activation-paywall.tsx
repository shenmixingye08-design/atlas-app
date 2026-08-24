"use client";

import { useEffect, useState } from "react";

import { startCheckout } from "@/lib/billing/client";
import { resolveActivationPaywall } from "@/lib/activation/paywall-policy";
import { postActivationClientEvent } from "@/lib/activation/client";
import type { ActivationPaywallReason } from "@/lib/activation/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ActivationPaywall({
  planId,
  reason,
  firstSuccess,
  paid,
  onDismiss,
}: {
  planId: string;
  reason: ActivationPaywallReason;
  firstSuccess: boolean;
  paid: boolean;
  onDismiss: () => void;
}) {
  const view = resolveActivationPaywall({
    planId,
    reason,
    firstSuccess,
    paid,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!view.show) return;
    void postActivationClientEvent({
      event: "paywall_viewed",
      sourcePage: "/projects",
    });
  }, [view.show]);

  if (!view.show || !view.targetPlan) return null;

  return (
    <Card padding="md" className="border border-[var(--border-subtle)]" role="dialog" aria-labelledby="activation-paywall-title">
      <h2 id="activation-paywall-title" className="text-sm font-semibold text-foreground">
        続けて任せる場合
      </h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{view.accomplished}</p>
      <p className="mt-2 text-sm text-foreground">{view.nextValue}</p>
      <p className="mt-3 text-caption text-[var(--text-secondary)]">
        いまのプラン: {view.currentPlan}（月{view.currentPriceJpy.toLocaleString("ja-JP")}円）
        ／ 案内: {view.targetPlan}（月{view.targetPriceJpy?.toLocaleString("ja-JP")}円）
      </p>
      <div className="mt-4 flex flex-col gap-2 min-[390px]:flex-row">
        <Button
          className="w-full min-[390px]:w-auto"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void startCheckout(view.targetPlan!).finally(() => setBusy(false));
          }}
        >
          プランを確認する
        </Button>
        <Button
          variant="ghost"
          className="w-full min-[390px]:w-auto"
          onClick={onDismiss}
        >
          後で決める
        </Button>
      </div>
    </Card>
  );
}
