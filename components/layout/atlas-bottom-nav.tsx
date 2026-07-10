"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import {
  resolveBottomNavId,
  shouldHideBottomNav,
  type BottomNavId,
} from "@/lib/layout/bottom-nav";

const NAV_ITEMS: {
  id: BottomNavId;
  href: string;
  label: string;
  icon: string;
}[] = [
  { id: "home", href: "/projects", label: ui.nav.home, icon: "⌂" },
  { id: "work", href: "/workspace", label: ui.nav.work, icon: "◎" },
  { id: "automations", href: "/automations", label: ui.nav.automations, icon: "↻" },
  { id: "integrations", href: "/integrations", label: ui.nav.integrations, icon: "⎘" },
  { id: "settings", href: "/settings", label: ui.nav.settings, icon: "⚙" },
];

export function AtlasBottomNav() {
  const pathname = usePathname() ?? "";

  if (shouldHideBottomNav(pathname)) {
    return null;
  }

  const active = resolveBottomNavId(pathname);

  return (
    <nav
      aria-label={ui.nav.menu}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-subtle)] bg-white/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          return (
            <li key={item.id} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "touch-target flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-1 text-[11px] font-medium transition-colors focus-ring",
                  isActive
                    ? "text-accent"
                    : "text-[var(--foreground-muted)] hover:text-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {item.icon}
                </span>
                <span className="leading-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
