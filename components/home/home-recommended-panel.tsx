"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  getRecommendedAutomations,
  getRecommendedIntegrations,
} from "@/lib/onboarding";
import { loadUserWorkProfile } from "@/lib/user-profile";
import { ui } from "@/lib/i18n";

type HomeRecommendedPanelProps = {
  variant?: "all" | "integrations" | "automations";
};

export function HomeRecommendedPanel({ variant = "all" }: HomeRecommendedPanelProps) {
  const profile = useMemo(() => loadUserWorkProfile(), []);
  const integrations = getRecommendedIntegrations(profile);
  const automations = getRecommendedAutomations(profile);

  const showIntegrations = variant === "all" || variant === "integrations";
  const showAutomations = variant === "all" || variant === "automations";

  if (
    (showIntegrations ? integrations.length : 0) === 0 &&
    (showAutomations ? automations.length : 0) === 0
  ) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">{ui.homeUx.integrationsEmpty}</p>
    );
  }

  return (
    <div className="space-y-5">
      {showIntegrations && integrations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            {ui.onboarding.recommendedIntegrations}
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {integrations.map((item) => (
              <li key={item.serviceId}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4 transition-colors duration-[var(--motion-base)] hover:bg-[var(--card)] focus-ring"
                >
                  <span className="text-2xl" aria-hidden>
                    {item.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.serviceName}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{item.reason}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showAutomations && automations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            {ui.onboarding.recommendedAutomations}
          </h3>
          <ul className="space-y-2">
            {automations.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4 transition-colors duration-[var(--motion-base)] hover:bg-[var(--card)] focus-ring"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{item.description}</p>
                  </div>
                  <span className="text-xs font-medium text-accent">{ui.onboarding.setup}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
