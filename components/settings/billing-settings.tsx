"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { PlanDefinition, PlanId, UserBillingSummary } from "@/lib/billing";
import {
  fetchBillingSummary,
  fetchPlanCatalog,
  formatPlanPriceJpy,
  openBillingPortal,
  startCheckout,
} from "@/lib/billing";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LegalFooterLinks } from "@/components/legal/legal-footer-links";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

function UsageMeter({
  label,
  used,
  limit,
  remaining,
}: {
  label: string;
  used: number;
  limit: number;
  remaining: number;
}) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-[var(--foreground-muted)]">
          {ui.billing.usageOf(used, limit)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--background-subtle)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-caption text-[var(--foreground-muted)]">
        {ui.billing.remainingTitle}: {remaining}
      </p>
    </div>
  );
}

function PlanCard({
  plan,
  currentPlanId,
  busy,
  onSelect,
}: {
  plan: PlanDefinition;
  currentPlanId: PlanId;
  busy: boolean;
  onSelect: (planId: PlanId) => void;
}) {
  const isCurrent = plan.planId === currentPlanId;

  return (
    <li
      className={cn(
        "rounded-[var(--radius-xl)] border p-5",
        isCurrent
          ? "border-[var(--accent)] bg-[var(--accent)]/5 ring-1 ring-[var(--accent)]/20"
          : "border-[var(--border-subtle)] bg-[var(--card)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            {plan.description}
          </p>
        </div>
        <p className="shrink-0 text-lg font-semibold text-foreground">
          {formatPlanPriceJpy(plan.monthlyPriceJpy)}
          {plan.monthlyPriceJpy > 0 && (
            <span className="text-caption font-normal text-[var(--foreground-muted)]">
              {ui.billing.perMonth}
            </span>
          )}
        </p>
      </div>

      <ul className="mt-4 space-y-1.5">
        {plan.highlights.map((item) => (
          <li key={item} className="text-sm text-[var(--foreground-muted)]">
            · {item}
          </li>
        ))}
      </ul>

      <div className="mt-5">
        {isCurrent ? (
          <span className="inline-flex rounded-full bg-[var(--status-success-bg)] px-3 py-1 text-xs font-medium text-[var(--status-success)]">
            {ui.billing.currentPlanBadge}
          </span>
        ) : plan.planId === "free" ? null : (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            isLoading={busy}
            onClick={() => onSelect(plan.planId)}
          >
            {ui.billing.selectPlan}
          </Button>
        )}
      </div>
    </li>
  );
}

export function BillingSettings() {
  const [summary, setSummary] = useState<UserBillingSummary | null>(null);
  const [plans, setPlans] = useState<readonly PlanDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<PlanId | null>(null);

  const load = useCallback(async () => {
    try {
      const [billing, catalog] = await Promise.all([
        fetchBillingSummary(),
        fetchPlanCatalog(),
      ]);
      setSummary(billing);
      setPlans(catalog.plans);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCheckout = async (planId: PlanId) => {
    setBusyPlanId(planId);
    setError(null);
    try {
      const { url } = await startCheckout(planId);
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.billing.checkoutFailed);
      setBusyPlanId(null);
    }
  };

  const handlePortal = async () => {
    setError(null);
    try {
      const { url } = await openBillingPortal();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.connectFailed);
    }
  };

  if (isLoading) {
    return <LoadingState message={ui.billing.loadingPlans} />;
  }

  if (!summary) {
    return <ErrorState message={error ?? ui.error.loadFailed} />;
  }

  return (
    <div className="space-y-8">
      {error && <ErrorState message={error} />}

      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-caption text-[var(--foreground-muted)]">
              {ui.billing.currentPlan}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">
              {summary.plan.name}
            </h2>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              {summary.plan.description}
            </p>
            {summary.subscription.currentPeriodEnd && (
              <p className="mt-2 text-caption text-[var(--foreground-muted)]">
                {ui.billing.periodEnd(
                  new Intl.DateTimeFormat("ja-JP", {
                    dateStyle: "medium",
                  }).format(new Date(summary.subscription.currentPeriodEnd)),
                )}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.billingPortalAvailable && (
              <Button variant="secondary" size="sm" onClick={() => void handlePortal()}>
                {ui.billing.manageBilling}
              </Button>
            )}
          </div>
        </div>
        <p className="mt-4 text-caption text-[var(--foreground-muted)]">
          {summary.stripeLiveMode
            ? ui.billing.stripeLiveNote
            : ui.billing.checkoutMockNote}
        </p>
      </Card>

      <section className="space-y-4">
        <h2 className="text-title text-foreground">{ui.billing.usageTitle}</h2>
        <Card padding="lg" className="space-y-6 shadow-[var(--shadow-soft)]">
          <UsageMeter
            label={ui.billing.aiRuns}
            used={summary.usage.aiRuns.used}
            limit={summary.usage.aiRuns.limit}
            remaining={summary.usage.aiRuns.remaining}
          />
          <UsageMeter
            label={ui.billing.snsPosts}
            used={summary.usage.snsPosts.used}
            limit={summary.usage.snsPosts.limit}
            remaining={summary.usage.snsPosts.remaining}
          />
          <UsageMeter
            label={ui.billing.automationTasks}
            used={summary.usage.automationTasks.used}
            limit={summary.usage.automationTasks.limit}
            remaining={summary.usage.automationTasks.remaining}
          />
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-title text-foreground">{ui.billing.changePlan}</h2>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2">
          {plans.map((plan) => (
            <PlanCard
              key={plan.planId}
              plan={plan}
              currentPlanId={summary.subscription.planId}
              busy={busyPlanId === plan.planId}
              onSelect={(planId) => void handleCheckout(planId)}
            />
          ))}
        </ul>
      </section>

      <div className="space-y-4 border-t border-[var(--border-subtle)] pt-6">
        <p className="text-caption text-[var(--foreground-muted)]">
          {ui.legal.billingNote}
          <Link href="/terms" className="text-[var(--accent)] hover:underline">
            {ui.legal.termsLink}
          </Link>
          および
          <Link href="/privacy" className="text-[var(--accent)] hover:underline">
            {ui.legal.privacyLink}
          </Link>
          {ui.legal.billingTermsAndPrivacy}
        </p>
        <LegalFooterLinks />
      </div>

      <p className="text-caption">
        <Link href="/settings" className="text-[var(--accent)] hover:underline">
          ← {ui.nav.settings}
        </Link>
      </p>
    </div>
  );
}
