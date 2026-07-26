import Link from "next/link";

import { AtlasHeaderAuth } from "@/components/layout/atlas-header-auth";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { OwnerNav, type OwnerNavActive } from "@/components/owner/owner-nav";
import { ui } from "@/lib/i18n";

type OwnerShellProps = {
  children: React.ReactNode;
  active?: OwnerNavActive;
};

/** MINERVOT executive console — Apple-like white / dark surfaces. */
export function OwnerShell({ children, active }: OwnerShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--background)] text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,113,227,0.06),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(0,0,0,0.03),_transparent_45%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(0,113,227,0.12),_transparent_50%),radial-gradient(ellipse_at_bottom_right,_rgba(255,255,255,0.03),_transparent_40%)]"
      />

      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--card-glass)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:px-8 md:py-5">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <Link
              href="/owner"
              className="owner-brand-enter text-lg font-semibold tracking-[-0.03em] text-foreground focus-ring rounded-md sm:text-xl"
            >
              MINERVOT
              <span className="ml-2 text-sm font-medium text-[var(--text-muted)]">
                経営ダッシュボード
              </span>
            </Link>
            <span className="rounded-full bg-[var(--warning-bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--warning)] ring-1 ring-[var(--warning)]/25">
              {ui.owner.ownerOnlyBadge}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Link
              href="/projects"
              className="touch-target text-sm text-[var(--text-secondary)] transition-colors hover:text-foreground focus-ring rounded-md"
            >
              {ui.owner.backToApp}
            </Link>
            <ThemeToggle />
            <AtlasHeaderAuth />
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-[1400px] gap-6 px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-8 md:px-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
        <aside className="owner-aside-enter">
          {active ? <OwnerNav active={active} /> : null}
        </aside>
        <main className="owner-main-enter min-w-0">{children}</main>
      </div>
    </div>
  );
}
