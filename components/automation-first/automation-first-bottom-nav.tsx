"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { CreateSheet } from "@/components/automation-first/create-sheet";
import {
  IconArtifact,
  IconAutomation,
  IconPlus,
  IconSettings,
  IconToday,
} from "@/components/ui/icons";
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

function BottomIcon({
  id,
  className,
}: {
  id: AutomationFirstBottomNavId;
  className?: string;
}) {
  switch (id) {
    case "today":
      return <IconToday className={className} />;
    case "automation":
      return <IconAutomation className={className} />;
    case "create":
      return <IconPlus className={className} />;
    case "artifacts":
      return <IconArtifact className={className} />;
    case "settings":
      return <IconSettings className={className} />;
    default:
      return <IconToday className={className} />;
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
        <ul className="mx-auto flex max-w-lg items-stretch justify-around px-0.5 pt-1">
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
                    className="flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium leading-tight focus-ring"
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-foreground)] shadow-[var(--shadow-cta)] transition-transform duration-[var(--motion-fast)] active:scale-95"
                      aria-hidden
                    >
                      <BottomIcon id={item.id} className="h-5 w-5" />
                    </span>
                    <span className="text-[var(--brand)]">{item.label}</span>
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
                    "flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-0.5 text-[11px] font-medium leading-tight transition-colors focus-ring",
                    isActive
                      ? "text-[var(--brand)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span aria-hidden>
                    <BottomIcon id={item.id} className="h-5 w-5" />
                  </span>
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
