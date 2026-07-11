"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

const ACTIONS = [
  { id: "add-work", href: "/commander", label: ui.homeUx.quickAddWork, icon: "＋" },
  { id: "commander", href: "/commander", label: ui.nav.commander, icon: "◈" },
  { id: "automations", href: "/automations", label: ui.homeUx.quickAutomation, icon: "↻" },
  { id: "search", href: "/commander", label: ui.homeUx.quickSearch, icon: "⌕" },
] as const;

export function HomeQuickActionsBar() {
  const pathname = usePathname() ?? "";

  if (pathname !== "/projects") {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 md:bottom-6 md:flex md:justify-center"
      style={{
        bottom: "calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <nav
        aria-label={ui.homeUx.quickActionsLabel}
        className={cn(
          "pointer-events-auto mx-auto w-full max-w-lg border-t border-[var(--border)] bg-[var(--card)]/95 px-3 py-2 shadow-[var(--shadow-md)] backdrop-blur-xl",
          "md:max-w-xl md:rounded-[var(--radius-xl)] md:border md:px-4 md:py-3",
        )}
      >
        <ul className="grid grid-cols-4 gap-1">
          {ACTIONS.map((action) => (
            <li key={action.id}>
              <Link
                href={action.href}
                className="touch-target flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[var(--radius-lg)] px-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors duration-[var(--motion-base)] hover:bg-[var(--surface-muted)] hover:text-foreground focus-ring"
              >
                <span className="text-base leading-none" aria-hidden>
                  {action.icon}
                </span>
                <span className="leading-tight">{action.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
