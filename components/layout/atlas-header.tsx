"use client";

import Link from "next/link";
import { useState } from "react";

import { NotificationBell } from "@/components/notifications/notification-bell";
import { OwnerNavLink } from "@/components/owner/owner-nav-link";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";

import { AtlasHeaderAuth } from "./atlas-header-auth";

export type AtlasNavPage =
  | "projects"
  | "workspace"
  | "mihon"
  | "automations"
  | "settings"
  | "company"
  | "integrations"
  | "connectors"
  | "connections"
  | "chat"
  | "history";

type AtlasHeaderProps = {
  active?: AtlasNavPage;
};

const PRIMARY_NAV: { id: AtlasNavPage; href: string; label: string }[] = [
  { id: "projects", href: "/projects", label: ui.nav.home },
  { id: "automations", href: "/automations", label: ui.nav.habits },
  { id: "workspace", href: "/workspace", label: ui.nav.work },
  { id: "mihon", href: "/mihon", label: ui.nav.mihon },
];

/** Secondary routes — desktop dropdown / mobile overflow menu (bottom nav covers primary). */
const MORE_NAV: { id: AtlasNavPage; href: string; label: string }[] = [
  { id: "chat", href: "/chat", label: ui.nav.chat },
  { id: "history", href: "/history", label: ui.activityHistory.nav },
  { id: "settings", href: "/settings/billing", label: ui.nav.billing },
  { id: "company", href: "/company", label: ui.nav.company },
  { id: "connectors", href: "/connectors", label: ui.nav.connectors },
  { id: "connections", href: "/connections", label: ui.nav.connections },
  { id: "integrations", href: "/integrations", label: ui.nav.integrations },
  { id: "mihon", href: "/mihon", label: ui.nav.mihon },
];

export function AtlasHeader({ active }: AtlasHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const isMoreActive = MORE_NAV.some((item) => item.id === active);

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl w-full items-center justify-between px-4 py-3 sm:px-6 sm:py-4 md:px-10 md:py-5">
        <Link
          href="/projects"
          className="text-sm font-semibold tracking-tight text-foreground focus-ring rounded-md"
        >
          {ui.brand}
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="メイン">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-sm transition-colors duration-[var(--motion-fast)] focus-ring rounded-md",
                active === item.id
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
              <div className="absolute right-0 top-full mt-2 min-w-[160px] rounded-[var(--radius-lg)] bg-white py-2 shadow-[var(--shadow-lg)] animate-fade-in">
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
          <AtlasHeaderAuth />
          <button
            type="button"
            className="touch-target rounded-md px-2 text-sm text-[var(--text-secondary)] md:hidden focus-ring"
            onClick={() => setMobileMoreOpen((v) => !v)}
            aria-expanded={mobileMoreOpen}
            aria-label={ui.nav.more}
          >
            {ui.nav.more}
          </button>
        </div>
      </div>

      {mobileMoreOpen && (
        <nav
          className="border-t border-[var(--border-subtle)] px-4 py-3 md:hidden animate-fade-in"
          aria-label={ui.nav.more}
        >
          {MORE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMoreOpen(false)}
              className={cn(
                "touch-target flex items-center border-b border-[var(--border)] py-3 text-sm last:border-0",
                active === item.id
                  ? "font-medium text-foreground"
                  : "text-[var(--text-secondary)]",
              )}
            >
              {item.label}
            </Link>
          ))}
          <OwnerNavLink className="touch-target block py-3 text-sm text-[var(--text-secondary)]" />
        </nav>
      )}
    </header>
  );
}
