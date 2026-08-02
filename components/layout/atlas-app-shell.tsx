"use client";

import { AtlasBackground } from "@/components/atlas-background";
import { AutomationDesignSystemRoot } from "@/components/automation-first/design-system-root";
import { AutomationFirstBottomNav } from "@/components/automation-first/automation-first-bottom-nav";
import { cn } from "@/lib/design-system/cn";
import { useFeatureAvailability } from "@/lib/feature-flags";
import type { AtlasNavPage } from "@/lib/layout/nav-types";
import { usePathname } from "next/navigation";

import { AtlasSidebar } from "./atlas-sidebar";
import { AtlasTopActions } from "./atlas-top-actions";

type AtlasAppShellProps = {
  active?: AtlasNavPage;
  children: React.ReactNode;
  /** narrow: workspace/chat · default: home · wide: grids */
  width?: "narrow" | "default" | "wide";
};

const MAIN_WIDTH: Record<NonNullable<AtlasAppShellProps["width"]>, string> = {
  narrow: "max-w-3xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
};

export function AtlasAppShell({
  active,
  children,
  width = "default",
}: AtlasAppShellProps) {
  const pathname = usePathname() ?? "";
  const { flags } = useFeatureAvailability();
  const isAutomationFirstPreview = pathname.startsWith(
    "/dev/automation-first-preview",
  );
  // Optimistic Preview/dev defaults keep this true while the map loads —
  // never mount legacy bottom-nav flash. Rollback = server flag off.
  const afNav =
    isAutomationFirstPreview ||
    flags.automation_first_navigation_enabled === true;

  return (
    <div className="minervot-lux relative min-h-screen bg-[var(--background)] text-foreground">
      <AutomationDesignSystemRoot />
      <AtlasBackground />
      <AtlasSidebar active={active} />
      {/* Desktop: fixed bell + account top-right */}
      <div
        className="fixed top-0 z-[60] hidden h-14 items-center justify-end gap-2 border-b border-[var(--border-subtle)] bg-[var(--card-glass)] px-6 backdrop-blur-xl md:flex md:left-[var(--sidebar-width)] md:right-0"
        aria-label="アカウントと通知"
      >
        <AtlasTopActions />
      </div>
      <div className="app-shell-content md:pl-[var(--sidebar-width)]">
        <main
          className={cn(
            "app-shell-main mx-auto w-full px-4 pt-[calc(var(--mobile-top-bar-height)+1rem)] sm:px-6 md:px-10 md:pt-[calc(3.5rem+1.5rem)] animate-page",
            MAIN_WIDTH[width],
            afNav &&
              "pb-[calc(var(--bottom-nav-height)+var(--safe-area-bottom)+1.5rem)] md:pb-10",
          )}
        >
          {children}
        </main>
      </div>
      {/* Bottom nav only when Automation First navigation flag is on (rollback = previous shell). */}
      {afNav ? <AutomationFirstBottomNav /> : null}
    </div>
  );
}

/** @deprecated Use AtlasAppShell */
export function AtlasPageShell({
  children,
}: {
  active?: AtlasNavPage;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-[var(--background)] text-foreground">
      {children}
    </div>
  );
}

export type { AtlasNavPage } from "@/lib/layout/nav-types";
