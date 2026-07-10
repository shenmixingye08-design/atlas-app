import Link from "next/link";

import { AtlasHeaderAuth } from "@/components/layout/atlas-header-auth";
import { ui } from "@/lib/i18n";

type OwnerShellProps = {
  children: React.ReactNode;
};

/** Owner console — same light design system as the user app. */
export function OwnerShell({ children }: OwnerShellProps) {
  return (
    <div className="relative min-h-screen bg-[var(--background)] text-foreground">
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:px-10 md:py-5">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <Link
              href="/owner"
              className="text-sm font-semibold tracking-tight text-foreground focus-ring rounded-md"
            >
              {ui.owner.shellTitle}
            </Link>
            <span className="rounded-full bg-[var(--warning-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--warning)] ring-1 ring-[var(--warning)]/25">
              {ui.owner.ownerOnlyBadge}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <p className="text-xs text-[var(--text-secondary)] md:hidden">
              {ui.owner.mobileHint}
            </p>
            <Link
              href="/projects"
              className="touch-target text-sm text-[var(--text-secondary)] transition-colors hover:text-foreground focus-ring rounded-md"
            >
              {ui.owner.backToApp}
            </Link>
            <AtlasHeaderAuth />
          </div>
        </div>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-10 md:px-10 md:pt-14">
        {children}
      </main>
    </div>
  );
}
