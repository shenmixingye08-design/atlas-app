"use client";

import Link from "next/link";
import { useEffect } from "react";

import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";
import { trackFunnelClient } from "@/lib/product-funnel/client";

import { HomeChatBar } from "./home-chat-bar";
import { HomeGreetingHeader } from "./home-greeting-header";

type SecretaryHomeDashboardProps = {
  automations: Automation[];
  projects: Project[];
};

/**
 * Post-login home — 5秒で「何ができるか / 次に何を押すか」が分かる第一画面。
 * 未実装機能は出さない。ダミー成果物への導線も出さない。
 */
export function SecretaryHomeDashboard({
  automations,
  projects,
}: SecretaryHomeDashboardProps) {
  useEffect(() => {
    trackFunnelClient("home_viewed", {
      hasHistory: projects.length > 0,
      hasAutomations: automations.length > 0,
    });
  }, [automations.length, projects.length]);

  return (
    <div className="home-dashboard mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center space-y-8 pb-16 pt-8 sm:space-y-10 sm:pb-20 sm:pt-12">
      <header className="space-y-3 text-center sm:space-y-4">
        <p className="text-sm font-medium tracking-wide text-accent">
          {ui.brand} — {ui.secretaryHome.brandTagline}
        </p>
        <HomeGreetingHeader automations={automations} projects={projects} />
        <p className="mx-auto max-w-lg text-base text-[var(--foreground-muted)] sm:text-lg">
          {ui.secretaryHome.zeroFrictionHint}
        </p>
        <ul className="mx-auto flex max-w-lg list-none flex-col gap-1.5 text-left text-sm text-foreground sm:text-base">
          {ui.secretaryHome.valueProps.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2"
            >
              {item.label}
            </li>
          ))}
        </ul>
        {projects.length > 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.secretaryHome.continueHint}{" "}
            <Link
              href="/history"
              className="font-medium text-accent underline-offset-2 hover:underline"
              onClick={() => trackFunnelClient("reuse_from_history")}
            >
              {ui.secretaryHome.continueCta}
            </Link>
          </p>
        ) : null}
      </header>

      <HomeChatBar />
    </div>
  );
}
