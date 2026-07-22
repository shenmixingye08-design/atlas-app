"use client";

import Link from "next/link";

import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function HomePrimaryCtas() {
  return (
    <section
      aria-label={ui.phase3.homeCtaLabel}
      className="flex flex-col gap-3 sm:flex-row"
    >
      <Link href="/workspace" className="flex-1">
        <Button variant="primary" size="lg" className="min-h-[48px] w-full">
          {ui.phase3.primaryCtaRequest}
        </Button>
      </Link>
      <Link href="/automations/new" className="flex-1 sm:max-w-xs">
        <Button variant="secondary" size="lg" className="min-h-[48px] w-full">
          {ui.phase3.secondaryCtaAutomation}
        </Button>
      </Link>
    </section>
  );
}
