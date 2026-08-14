"use client";
import { scheduleMountWork } from "@/lib/react/schedule-mount-work";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PlanDefinition, PlanId, UserBillingSummary } from "@/lib/billing";
import {
  CheckoutRequestError,
  fetchBillingSummary,
  fetchPlanCatalog,
  formatPlanPriceJpy,
  isPlanId,
  openBillingPortal,
  shouldOpenPortalForPlanChange,
  startCheckout,
  subscribeBillingUsageChanged,
} from "@/lib/billing";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LegalFooterLinks } from "@/components/legal/legal-footer-links";
import { UsageItemCard } from "@/components/billing/usage-item-card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  USAGE_PERIOD_RIGHTS_NOTE,
  offeredUsageItems,
} from "@/lib/billing/usage-awareness";

function AiUsagePeriodCard({
  label,
  requests,
  totalTokens,
}: {
  label: string;
  requests: number;
  totalTokens: number;
}) {
  return (
    <div className="space-y-1 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-sm text-[var(--foreground-muted)]">
        {ui.billing.usageRequests}: {requests}
      </p>
      <p className="text-sm text-[var(--foreground-muted)]">
        {ui.billing.usageTokens}: {totalTokens.toLocaleString("ja-JP")}
      </p>
    </div>
  );
}

function PlanCard({
  plan,
  currentPlanId,
  busy,
  disabled,
  busyLabel,
  error,
  onSelect,
}: {
  plan: PlanDefinition;
  currentPlanId: PlanId;
  busy: boolean;
  disabled: boolean;
  busyLabel: string;
  error: string | null;
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
      {plan.notes && plan.notes.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {plan.notes.map((note) => (
            <li
              key={note}
              className="text-caption text-[var(--foreground-muted)]"
            >
              {note}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 space-y-2">
        {isCurrent ? (
          <span className="inline-flex rounded-full bg-[var(--status-success-bg)] px-3 py-1 text-xs font-medium text-[var(--status-success)]">
            {ui.billing.currentPlanBadge}
          </span>
        ) : plan.planId === "free" ? null : (
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[44px] w-full sm:w-auto"
            disabled={disabled || busy}
            aria-busy={busy}
            onClick={() => onSelect(plan.planId)}
          >
            {busy ? busyLabel : ui.billing.selectPlan}
          </Button>
        )}
        {error ? (
          <p
            className="text-sm text-[var(--error)]"
            role="alert"
            aria-live="polite"
          >
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function BillingSettings() {
  const searchParams = useSearchParams();
  const checkoutState = searchParams.get("checkout");
  const checkoutPlanParam = searchParams.get("plan");

  const [summary, setSummary] = useState<UserBillingSummary | null>(null);
  const [plans, setPlans] = useState<readonly PlanDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<PlanId | null>(null);
  const [cardError, setCardError] = useState<{
    planId: PlanId;
    message: string;
  } | null>(null);
  const [busyKind, setBusyKind] = useState<"checkout" | "portal" | null>(null);

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
    return scheduleMountWork(() => {
      void load();
    });
  }, [load]);

  // Quietly refetch just the usage/plan summary (no full-screen loading) so the
  // meters stay current after a completion or when the tab regains focus.
  const refreshSummary = useCallback(async () => {
    try {
      const billing = await fetchBillingSummary();
      setSummary(billing);
      setError(null);
    } catch {
      // Keep the previously loaded summary on a transient refresh failure.
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeBillingUsageChanged(() => {
      void refreshSummary();
    });
    const onFocus = () => void refreshSummary();
    window.addEventListener("focus", onFocus);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshSummary]);

  const checkoutSuccessMessage = useMemo(() => {
    if (checkoutState !== "success" || !summary) return null;
    const planId =
      checkoutPlanParam && isPlanId(checkoutPlanParam)
        ? checkoutPlanParam
        : summary.subscription.planId;
    const planName =
      plans.find((plan) => plan.planId === planId)?.name ??
      summary.plan.name;
    return ui.billing.checkoutSuccessBanner(planName);
  }, [checkoutState, checkoutPlanParam, plans, summary]);

  const handleCheckout = async (planId: PlanId) => {
    if (busyPlanId) return;
    setBusyPlanId(planId);
    setError(null);
    setCardError(null);

    const usePortal = shouldOpenPortalForPlanChange({
      currentPlanId: summary?.subscription.planId ?? "free",
      targetPlanId: planId,
      isPaid: Boolean(summary?.subscription.isPaid),
    });
    setBusyKind(usePortal ? "portal" : "checkout");

    const fail = (message: string) => {
      setCardError({ planId, message });
      setError(message);
      setBusyPlanId(null);
      setBusyKind(null);
    };

    try {
      if (usePortal) {
        const { url } = await openBillingPortal();
        window.location.assign(url);
        return;
      }

      const { url } = await startCheckout(planId);
      window.location.assign(url);
    } catch (err) {
      if (
        err instanceof CheckoutRequestError &&
        err.code === "use_portal_for_plan_change"
      ) {
        try {
          setBusyKind("portal");
          const { url } = await openBillingPortal();
          window.location.assign(url);
          return;
        } catch (portalErr) {
          fail(
            portalErr instanceof Error
              ? portalErr.message
              : ui.billing.checkoutFailed,
          );
          return;
        }
      }

      if (err instanceof CheckoutRequestError && err.status === 401) {
        fail(ui.billing.checkoutSignInRequired);
        return;
      }

      if (
        err instanceof CheckoutRequestError &&
        (err.code === "already_same_plan" ||
          err.code === "subscription_sync_required")
      ) {
        try {
          const billing = await fetchBillingSummary();
          setSummary(billing);
        } catch {
          // Keep the previous summary if refresh fails.
        }
        fail(
          err.code === "already_same_plan"
            ? ui.billing.alreadySamePlanSynced
            : ui.billing.subscriptionSyncing,
        );
        return;
      }

      fail(err instanceof Error ? err.message : ui.billing.checkoutFailed);
    }
  };

  const handlePortal = async () => {
    if (busyPlanId) return;
    setBusyPlanId(summary?.subscription.planId ?? "free");
    setBusyKind("portal");
    setError(null);
    try {
      const { url } = await openBillingPortal();
      window.location.assign(url);
    } catch (err) {
      const message =
        err instanceof CheckoutRequestError && err.status === 401
          ? ui.billing.checkoutSignInRequired
          : err instanceof Error
            ? err.message
            : ui.error.connectFailed;
      setError(message);
      setBusyPlanId(null);
      setBusyKind(null);
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

      {checkoutSuccessMessage && (
        <p
          className="rounded-[var(--radius-lg)] border border-[var(--status-success)]/30 bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--status-success)]"
          role="status"
        >
          {checkoutSuccessMessage}
        </p>
      )}

      {summary.subscriptionConsistency === "conflict" && (
        <p
          className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--background-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]"
          role="status"
        >
          {ui.billing.subscriptionSyncing}
        </p>
      )}

      {checkoutState === "cancelled" && (
        <p
          className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--background-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]"
          role="status"
        >
          {ui.billing.checkoutCancelledBanner}
        </p>
      )}

      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-caption text-[var(--foreground-muted)]">
              {ui.billing.currentPlan}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">
              {summary.subscriptionConsistency === "conflict"
                ? ui.billing.subscriptionSyncing
                : summary.plan.name}
            </h2>
            {summary.subscriptionConsistency === "conflict" ? null : (
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              {summary.plan.description}
            </p>
            )}
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
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              disabled={
                busyPlanId !== null ||
                summary.subscriptionConsistency === "conflict"
              }
              aria-busy={busyKind === "portal"}
              onClick={() => void handlePortal()}
            >
              {busyKind === "portal"
                ? ui.billing.openingPortal
                : ui.billing.manageBilling}
            </Button>
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
        {summary.usageAwareness.periodRightsDiffer ? (
          <p className="text-sm text-[var(--text-secondary)]">
            {USAGE_PERIOD_RIGHTS_NOTE}
          </p>
        ) : null}
        <p className="text-caption text-[var(--text-secondary)]">
          {summary.usageAwareness.resetLabel}
        </p>
        <Card padding="lg" className="space-y-3 shadow-[var(--shadow-soft)]">
          {offeredUsageItems(summary.usageAwareness).map((item) => (
            <UsageItemCard key={item.id} item={item} />
          ))}
          {summary.usage.aiDetail && (
            <div className="space-y-3 border-t border-[var(--border-subtle)] pt-6">
              <h3 className="text-sm font-semibold text-foreground">
                {ui.billing.aiUsageDetailTitle}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <AiUsagePeriodCard
                  label={ui.billing.usageToday}
                  requests={summary.usage.aiDetail.today.requests}
                  totalTokens={summary.usage.aiDetail.today.totalTokens}
                />
                <AiUsagePeriodCard
                  label={ui.billing.usageMonth}
                  requests={summary.usage.aiDetail.month.requests}
                  totalTokens={summary.usage.aiDetail.month.totalTokens}
                />
                <AiUsagePeriodCard
                  label={ui.billing.usageAllTime}
                  requests={summary.usage.aiDetail.allTime.requests}
                  totalTokens={summary.usage.aiDetail.allTime.totalTokens}
                />
              </div>
            </div>
          )}
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
              disabled={
                busyPlanId !== null ||
                summary.subscriptionConsistency === "conflict"
              }
              busyLabel={
                busyKind === "portal"
                  ? ui.billing.openingPortal
                  : ui.billing.openingCheckout
              }
              error={
                cardError?.planId === plan.planId ? cardError.message : null
              }
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
