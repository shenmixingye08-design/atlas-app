"use client";

import Link from "next/link";

import {
  activationEmptyCopy,
  type ActivationEmptySurface,
} from "@/lib/activation/empty-copy";
import { Button } from "@/components/ui/button";

export function ActivationEmptyState({
  surface,
  className,
}: {
  surface: ActivationEmptySurface;
  className?: string;
}) {
  const copy = activationEmptyCopy(surface);
  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
    >
      <h3 className="text-sm font-semibold text-foreground">{copy.title}</h3>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{copy.description}</p>
      <div className="mt-4 flex flex-col gap-2 min-[390px]:flex-row">
        <Link
          href={copy.primaryHref}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-accent px-4 text-sm font-medium text-[var(--accent-foreground,#fff)] focus-ring"
        >
          {copy.primaryLabel}
        </Link>
        {copy.secondaryHref && copy.secondaryLabel ? (
          <Link href={copy.secondaryHref}>
            <Button variant="ghost" className="min-h-[44px] w-full min-[390px]:w-auto">
              {copy.secondaryLabel}
            </Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
