import { AtlasBackground } from "@/components/atlas-background";
import { cn } from "@/lib/design-system/cn";
import type { AtlasNavPage } from "@/lib/layout/nav-types";

import { AtlasSidebar } from "./atlas-sidebar";

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
      <div className="app-shell-content md:pl-[var(--sidebar-width)]">
        <main
          className={cn(
            "app-shell-main mx-auto w-full px-4 pt-[calc(var(--mobile-top-bar-height)+1rem)] sm:px-6 md:px-10 md:pt-10 animate-page",
            MAIN_WIDTH[width],
          )}
        >
          {children}
        </main>
      </div>
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
