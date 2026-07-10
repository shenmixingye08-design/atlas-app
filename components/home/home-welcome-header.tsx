"use client";

import { ui } from "@/lib/i18n";

export function HomeWelcomeHeader() {
  return (
    <header className="space-y-4 pb-2">
      <p className="text-sm text-[var(--foreground-muted)]">{ui.home.welcomeTitle}</p>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-[2.5rem] lg:leading-tight">
        {ui.home.welcomeHeadline}
      </h1>
      <p className="max-w-2xl text-sm text-[var(--foreground-muted)] sm:text-base">
        {ui.home.welcomeHint}
      </p>
    </header>
  );
}
