"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import { CreateSheet } from "@/components/automation-first/create-sheet";
import { BottomNavGroup, BottomNavTab } from "@/components/motion/nav-indicator";
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
        className="atlas-bottom-nav fixed inset-x-0 bottom-0 z-[var(--z-nav)] border-t border-[var(--border-subtle)] bg-[var(--surface-raised)] md:hidden"
        style={{ paddingBottom: "var(--safe-area-bottom)" }}
      >
        <BottomNavGroup className="relative mx-auto flex max-w-lg items-stretch justify-around px-0.5 pt-1">
          {ITEMS.map((item) => {
            const isActive = active === item.id;

            return (
              <BottomNavTab
                key={item.id}
                href={item.primary ? undefined : (item.href ?? "/projects")}
                label={item.label}
                icon={<BottomIcon id={item.id} className="h-5 w-5" />}
                active={isActive}
                pillId="af-bottom-nav-pill"
                primary={item.primary}
                onClick={() => {
                  if (item.primary) {
                    setSheetOpen(true);
                    trackAutomationFirstEvent("mobile_bottom_nav_used", {
                      id: "create",
                    });
                    return;
                  }
                  trackAutomationFirstEvent("mobile_bottom_nav_used", {
                    id: item.id,
                  });
                }}
                className={cn(
                  item.primary
                    ? "text-[var(--brand)]"
                    : isActive
                      ? "text-[var(--brand)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                )}
              />
            );
          })}
        </BottomNavGroup>
      </nav>
      <CreateSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
