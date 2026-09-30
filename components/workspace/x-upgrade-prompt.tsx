"use client";

import Link from "next/link";

import { trackAutomationFirstEvent } from "@/lib/automation-first/analytics";
import { formatLandingPrice } from "@/lib/landing/content";
import { getPlanDefinition } from "@/lib/billing/plans/registry";

/**
 * Shown exactly when the monthly X allowance is used up — the moment a free
 * user has seen the value and wants more. Prices come from the plan registry.
 */
export function XUpgradePrompt({ source }: { source: string }) {
  const light = getPlanDefinition("light");
  const posts = light.limits.xAutoPostsMonthly;
  return (
    <div
      data-testid="x-upgrade-prompt"
      className="ui-card ui-card-pad space-y-3 border-[color-mix(in_oklch,var(--brand)_28%,transparent)] bg-[var(--brand-muted)]"
    >
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          今月の投稿回数を使い切りました
        </p>
        <p className="mt-1 text-[length:var(--text-caption)] leading-relaxed text-[var(--text-secondary)]">
          毎日の投稿を続けるには {light.name} プラン（月
          {formatLandingPrice(light.monthlyPriceJpy)}・月{posts}回まで）をご利用ください。
          設定したテーマ・時刻はそのまま引き継がれます。
        </p>
      </div>
      <Link
        href="/settings/billing"
        onClick={() => trackAutomationFirstEvent("x_upgrade_clicked", { source })}
        className="btn-brand min-h-[44px] w-full sm:w-auto"
      >
        プランを見る
      </Link>
    </div>
  );
}
