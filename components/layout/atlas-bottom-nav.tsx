"use client";

import { usePathname } from "next/navigation";

import { BottomNavGroup, BottomNavTab } from "@/components/motion/nav-indicator";
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
  primary?: boolean;
}[] = [
  { id: "home", href: "/projects", label: ui.nav.home, icon: "⌂" },
  { id: "history", href: "/history", label: ui.nav.history, icon: "☰" },
  { id: "request", href: "/workspace", label: ui.nav.send, icon: "＋", primary: true },
  { id: "automation", href: "/automations", label: ui.nav.automation, icon: "↻" },
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
      className="atlas-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)] md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <BottomNavGroup className="relative mx-auto flex max-w-lg items-stretch justify-around px-0.5 pt-1">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;

          return (
            <BottomNavTab
              key={item.id}
              href={item.href}
              label={item.label}
              icon={
                item.primary ? (
                  <span className="text-lg leading-none">{item.icon}</span>
                ) : (
                  <span className="text-lg leading-none">{item.icon}</span>
                )
              }
              active={isActive}
              pillId="atlas-bottom-nav-pill"
              primary={item.primary}
              className={cn(
                item.primary
                  ? "text-accent"
                  : isActive
                    ? "text-accent"
                    : "text-[var(--foreground-muted)] hover:text-foreground",
                "touch-target",
              )}
            />
          );
        })}
      </BottomNavGroup>
    </nav>
  );
}
