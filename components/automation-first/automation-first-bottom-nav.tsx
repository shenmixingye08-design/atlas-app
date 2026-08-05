"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { CreateSheet } from "@/components/automation-first/create-sheet";
import { trackAutomationFirstEvent } from "@/lib/automation-first/analytics";
import {
  resolveAutomationFirstBottomNavId,
  type AutomationFirstBottomNavId,
} from "@/lib/automation-first/nav";
import { cn } from "@/lib/design-system/cn";
import { shouldHideBottomNav } from "@/lib/layout/bottom-nav";

const ITEMS: Array<{
  id: AutomationFirstBottomNavId;
  href?: string;
  label: string;
  primary?: boolean;
}> = [
  { id: "today", href: "/today", label: "今日" },
  { id: "automation", href: "/automations", label: "自動化" },
  { id: "create", label: "追加", primary: true },
  { id: "artifacts", href: "/history", label: "成果物" },
  { id: "settings", href: "/settings", label: "設定" },
];

function NavIcon({
  id,
  active,
}: {
  id: AutomationFirstBottomNavId;
  active?: boolean;
}) {
  const stroke = active ? "var(--brand)" : "currentColor";
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    className: "af-icon",
  };

  switch (id) {
    case "today":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </svg>
      );
    case "automation":
      return (
        <svg {...common}>
          <path d="M12 3v4M12 17v4M4.9 7.5l3.5 2M15.6 14.5l3.5 2M4.9 16.5l3.5-2M15.6 9.5l3.5-2" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "create":
      return (
        <svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden
          className="af-icon--sm"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "artifacts":
      return (
        <svg {...common}>
          <path d="M8 4h7l5 5v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          <path d="M15 4v5h5M9 13h6M9 17h4" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2.2M12 18.8V21M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6" />
        </svg>
      );
    default:
      return null;
  }
}

export function AutomationFirstBottomNav() {
  const pathname = usePathname() ?? "";
  const [sheetOpen, setSheetOpen] = useState(false);

  if (shouldHideBottomNav(pathname)) return null;

  const active = resolveAutomationFirstBottomNavId(pathname);

  return (
    <>
      <nav
        aria-label="メインメニュー"
        className="fixed inset-x-0 bottom-0 z-[var(--z-nav)] border-t border-[var(--border)] bg-[var(--card-glass)] backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
          {ITEMS.map((item) => {
            const isActive = active === item.id;

            if (item.primary) {
              return (
                <li key={item.id} className="flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSheetOpen(true);
                      trackAutomationFirstEvent("mobile_bottom_nav_used", {
                        id: "create",
                      });
                    }}
                    className="flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium leading-tight text-[var(--brand)] focus-ring"
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-foreground)] transition-transform duration-[var(--motion-fast)] active:scale-[0.97]"
                      aria-hidden
                    >
                      <NavIcon id="create" />
                    </span>
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            }

            return (
              <li key={item.id} className="flex-1">
                <Link
                  href={item.href ?? "/projects"}
                  onClick={() =>
                    trackAutomationFirstEvent("mobile_bottom_nav_used", {
                      id: item.id,
                    })
                  }
                  className={cn(
                    "flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] px-0.5 text-[11px] font-medium leading-tight transition-colors duration-[var(--motion-fast)] focus-ring",
                    isActive
                      ? "text-[var(--brand)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <NavIcon id={item.id} active={isActive} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <CreateSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
