"use client";

import Link from "next/link";

import { IconReuse } from "@/components/ui/icons";
import { trackAutomationFirstEvent } from "@/lib/automation-first/analytics";
import { cn } from "@/lib/design-system/cn";
import {
  HOME_OTHER_WORK_CTA,
  HOME_OTHER_WORK_HREF,
  HOME_X_AUTOMATION_CTA,
  HOME_X_AUTOMATION_HREF,
  HOME_X_AUTOMATION_SUPPORT,
} from "@/lib/product-focus/messaging";

export const HOME_ONE_TIME_HREF = HOME_OTHER_WORK_HREF;
export const HOME_AUTOMATION_HREF = HOME_X_AUTOMATION_HREF;

function trackPrimary(source: string) {
  trackAutomationFirstEvent("primary_automation_cta_clicked", { source });
  trackAutomationFirstEvent("home_primary_automation_clicked", { source });
}

function trackOneTime(source: string) {
  trackAutomationFirstEvent("one_time_request_clicked", { source });
  trackAutomationFirstEvent("home_primary_one_time_clicked", { source });
}

/**
 * Returning users: one slim row so their live work stays above the fold.
 * Same destinations and copy as the full card.
 */
function CompactPrimaryActions() {
  return (
    <section
      data-testid="home-primary-actions"
      aria-label="MINERVOTに任せる方法"
      className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-center"
    >
      <Link
        href={HOME_X_AUTOMATION_HREF}
        onClick={() => trackPrimary("home_primary_compact")}
        className="motion-press-card focus-ring group flex min-h-[var(--touch-target)] items-center gap-3 rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2.5 shadow-[var(--shadow-subtle)] transition-[border-color,box-shadow] duration-[var(--motion-fast)] [@media(hover:hover)_and_(pointer:fine)]:hover:border-[var(--border-strong)]"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] text-[var(--brand-foreground)]"
        >
          <IconReuse className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
            {HOME_X_AUTOMATION_CTA}
          </span>
          <span className="block truncate text-[length:var(--text-meta)] text-[var(--text-secondary)]">
            {HOME_X_AUTOMATION_SUPPORT}
          </span>
        </span>
        <span
          aria-hidden
          className="shrink-0 text-lg leading-none text-[var(--text-muted)] transition-transform duration-[var(--motion-fast)] [@media(hover:hover)_and_(pointer:fine)]:group-hover:translate-x-0.5"
        >
          ›
        </span>
      </Link>
      <Link
        href={HOME_OTHER_WORK_HREF}
        onClick={() => trackOneTime("home_secondary_compact")}
        className="inline-flex min-h-[var(--touch-target)] items-center justify-center px-2 text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
      >
        {HOME_OTHER_WORK_CTA}
      </Link>
    </section>
  );
}

export function HomePrimaryActions({ compact = false }: { compact?: boolean }) {
  if (compact) return <CompactPrimaryActions />;
  return (
    <section
      data-testid="home-primary-actions"
      aria-label="MINERVOTに任せる方法"
      className="grid grid-cols-1 gap-3"
    >
      <Link
        href={HOME_X_AUTOMATION_HREF}
        onClick={() => {
          trackAutomationFirstEvent("primary_automation_cta_clicked", {
            source: "home_primary",
          });
          trackAutomationFirstEvent("home_primary_automation_clicked", {
            source: "home_primary",
          });
        }}
        aria-labelledby="home-primary-x-automation"
        className={cn(
          "motion-press-card group flex h-full min-h-[var(--touch-target)] flex-col rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-subtle)] transition-[border-color,box-shadow] duration-[var(--motion-fast)]",
          "[@media(hover:hover)_and_(pointer:fine)]:hover:border-[var(--border-strong)] [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-[var(--shadow-floating)]",
          "focus-ring",
          "p-5 sm:p-6",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center rounded-2xl bg-[var(--brand-muted)] text-[var(--brand)]",
            "h-12 w-12",
          )}
          aria-hidden
        >
          <IconReuse className="h-6 w-6" />
        </div>
        <h2
          id="home-primary-x-automation"
          className={cn(
            "mt-4 font-semibold tracking-tight text-[var(--text-primary)]",
            "text-xl sm:text-2xl",
          )}
        >
          {HOME_X_AUTOMATION_CTA}
        </h2>
        <p
          className={cn(
            "mt-2 text-[length:var(--text-body)] leading-[var(--leading-body)] text-[var(--text-secondary)]",
          )}
        >
          {HOME_X_AUTOMATION_SUPPORT}
        </p>
        <span className={cn("btn-brand mt-5 w-full", "pointer-events-none")}>
          {HOME_X_AUTOMATION_CTA}
        </span>
      </Link>

      <Link
        href={HOME_OTHER_WORK_HREF}
        onClick={() => {
          trackAutomationFirstEvent("one_time_request_clicked", {
            source: "home_secondary",
          });
          trackAutomationFirstEvent("home_primary_one_time_clicked", {
            source: "home_secondary",
          });
        }}
        className="inline-flex min-h-[var(--touch-target)] items-center justify-center text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
      >
        {HOME_OTHER_WORK_CTA}
      </Link>
    </section>
  );
}
