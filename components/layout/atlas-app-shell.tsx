import { AtlasBackground } from "@/components/atlas-background";
import { cn } from "@/lib/design-system/cn";
import type { AtlasNavPage } from "@/lib/layout/nav-types";

import { AtlasBottomNav } from "./atlas-bottom-nav";
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
  wide: "max-w-6xl",
};

export function AtlasAppShell({
  active,
  children,
  width = "default",
}: AtlasAppShellProps) {
  return (
    <div className="minervot-lux relative min-h-screen bg-[var(--background)] text-foreground">
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
            "pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-10",
            MAIN_WIDTH[width],
          )}
        >
          {children}
        </main>
      </div>
      <AtlasBottomNav />
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
