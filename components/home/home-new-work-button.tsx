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
    </section>
  );
}
