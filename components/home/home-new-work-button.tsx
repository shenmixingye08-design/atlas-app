"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ui } from "@/lib/i18n";

export function HomeNewWorkButton() {
  return (
    <section aria-labelledby="new-work-heading" className="py-2">
      <Link href="/workspace" className="block">
        <Button
          variant="primary"
          size="lg"
          className="h-auto w-full rounded-[var(--radius-2xl)] px-8 py-6 text-lg font-semibold shadow-[var(--shadow-soft)]"
        >
          {ui.actions.registerNewWork}
        </Button>
      </Link>
      <Link
        href="/workspace?mode=batch"
        className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center text-sm text-accent focus-ring"
      >
        成果物をまとめて作る
      </Link>
    </section>
  );
}
