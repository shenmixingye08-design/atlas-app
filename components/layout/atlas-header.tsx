"use client";

import Link from "next/link";
import { useState } from "react";

import { NotificationBell } from "@/components/notifications/notification-bell";
import { OwnerNavLink } from "@/components/owner/owner-nav-link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";

import { AtlasHeaderAuth } from "./atlas-header-auth";

export type AtlasNavPage =
  | "projects"
  | "workspace"
  | "history"
  | "work-memory"
  | "learning"
  | "settings"
  | "billing"
  | "contact"
  | "help"
  /** Legacy page ids — kept for existing routes; not shown in general nav. */
  | "mihon"
  | "automations"
  | "company"
  | "integrations"
  | "connectors"
  | "connections"
  | "chat";

type AtlasHeaderProps = {
  active?: AtlasNavPage;
};

const PRIMARY_NAV: { id: AtlasNavPage; href: string; label: string }[] = [
  { id: "projects", href: "/projects", label: ui.nav.home },
  { id: "workspace", href: "/workspace", label: ui.nav.newRequest },
  { id: "history", href: "/history", label: ui.nav.requestHistory },
  { id: "work-memory", href: "/settings/work-memory", label: ui.nav.workMemory },
  { id: "learning", href: "/settings/learning", label: ui.nav.analysis },
];

/** Secondary routes under 「その他」— desktop dropdown / mobile overflow. */
const MORE_NAV: { id: AtlasNavPage; href: string; label: string }[] = [
  { id: "automations", href: "/automations", label: ui.nav.entrustedJobs },
  { id: "settings", href: "/settings", label: ui.nav.settings },
  { id: "billing", href: "/settings/billing", label: ui.nav.billingCredits },
  { id: "contact", href: "/contact", label: ui.nav.contact },
  { id: "help", href: "/capabilities", label: ui.nav.help },
];

function resolvePrimaryActive(active?: AtlasNavPage): AtlasNavPage | undefined {
  if (active === "chat") return "workspace";
  return active;
}

export function AtlasHeader({ active }: AtlasHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const primaryActive = resolvePrimaryActive(active);
  const isMoreActive = MORE_NAV.some((item) => item.id === active);

  return (
    <header className="sticky top-0 z-50 bg-[var(--card-glass)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl w-full items-center justify-between px-4 py-3 sm:px-6 sm:py-4 md:px-10 md:py-5">
        <Link
          href="/projects"
          className="text-sm font-semibold tracking-tight text-foreground focus-ring rounded-md"
        >
          {ui.brand}
        </Link>

        <nav className="hidden items-center gap-5 lg:gap-7 md:flex" aria-label="メイン">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap text-sm transition-colors duration-[var(--motion-fast)] focus-ring rounded-md",
                primaryActive === item.id
                  ? "font-medium text-foreground"
                  : "text-[var(--text-secondary)] hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className={cn(
                "touch-target text-sm transition-colors focus-ring rounded-md px-2",
                isMoreActive
                  ? "font-medium text-foreground"
                  : "text-[var(--text-secondary)] hover:text-foreground",
              )}
            >
              {ui.nav.more}
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full mt-2 min-w-[180px] rounded-[var(--radius-lg)] bg-[var(--card)] py-2 shadow-[var(--shadow-lg)] animate-fade-in">
                {MORE_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="block px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
                <OwnerNavLink />
              </div>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <NotificationBell />
          <ThemeToggle />
          <AtlasHeaderAuth />
          <button
            type="button"
            className="touch-target min-h-[44px] min-w-[44px] rounded-md px-2 text-sm font-medium text-[var(--text-secondary)] md:hidden focus-ring"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-expanded={mobileMenuOpen}
            aria-label={ui.nav.menu}
          >
            {mobileMenuOpen ? ui.actions.close : ui.nav.menu}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav
          className="border-t border-[var(--border-subtle)] px-4 py-2 md:hidden animate-fade-in"
          aria-label={ui.nav.menu}
        >
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "touch-target flex min-h-[48px] items-center border-b border-[var(--border)] py-3 text-base last:border-0",
                primaryActive === item.id
                  ? "font-medium text-foreground"
                  : "text-[var(--text-secondary)]",
              )}
            >
              {item.label}
            </Link>
          ))}
          <p className="pt-3 pb-1 text-xs font-medium tracking-wide text-[var(--foreground-muted)]">
            {ui.nav.more}
          </p>
          {MORE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "touch-target flex min-h-[48px] items-center border-b border-[var(--border)] py-3 text-base last:border-0",
                active === item.id
                  ? "font-medium text-foreground"
                  : "text-[var(--text-secondary)]",
              )}
            >
              {item.label}
            </Link>
          ))}
          <OwnerNavLink className="touch-target flex min-h-[48px] items-center py-3 text-base text-[var(--text-secondary)]" />
        </nav>
      )}
    </header>
  );
}
