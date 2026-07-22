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
  { id: "work", href: "/history", label: ui.nav.work, icon: "☰" },
  { id: "automation", href: "/automations", label: ui.nav.automation, icon: "↻" },
  { id: "deliverables", href: "/deliverables", label: ui.nav.deliverables, icon: "📁" },
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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-subtle)] bg-[var(--card-glass)] backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-0.5 pt-1">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;

          return (
            <li key={item.id} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "touch-target flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-0.5 text-[11px] font-medium leading-tight transition-colors focus-ring",
                  isActive
                    ? "text-accent"
                    : "text-[var(--foreground-muted)] hover:text-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {item.icon}
                </span>
                <span className="max-w-full text-center">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
