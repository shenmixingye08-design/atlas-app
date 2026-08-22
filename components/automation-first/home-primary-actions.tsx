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
} from "@/lib/product-focus/messaging";

export const HOME_ONE_TIME_HREF = HOME_OTHER_WORK_HREF;
export const HOME_AUTOMATION_HREF = HOME_X_AUTOMATION_HREF;

export function HomePrimaryActions({ compact = false }: { compact?: boolean }) {
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
          "group flex h-full min-h-[var(--touch-target)] flex-col rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-md)] transition-colors duration-[var(--motion-fast)]",
          "hover:border-[color-mix(in_srgb,var(--brand)_28%,var(--border))] hover:shadow-[var(--shadow-lg)]",
          "focus-ring",
          compact ? "p-4 sm:p-5" : "p-5 sm:p-6",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center rounded-2xl bg-[var(--brand-muted)] text-[var(--brand)]",
            compact ? "h-10 w-10" : "h-12 w-12",
          )}
          aria-hidden
        >
          <IconReuse className={compact ? "h-5 w-5" : "h-6 w-6"} />
        </div>
        <h2
          id="home-primary-x-automation"
          className={cn(
            "mt-4 font-semibold tracking-tight text-[var(--text-primary)]",
            compact ? "text-lg sm:text-xl" : "text-xl sm:text-2xl",
          )}
        >
          {HOME_X_AUTOMATION_CTA}
        </h2>
        <p
          className={cn(
            "mt-2 text-[length:var(--text-body)] leading-[var(--leading-body)] text-[var(--text-secondary)]",
            compact && "line-clamp-2",
          )}
        >
          毎日のX投稿から始められます。一度設定すれば、次回から同じ指示は不要です。
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
