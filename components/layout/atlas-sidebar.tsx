"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { OwnerNavLink } from "@/components/owner/owner-nav-link";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import type { AtlasNavPage } from "@/lib/layout/nav-types";
import {
  SIDEBAR_MORE_GROUPS,
  SIDEBAR_PRIMARY_NAV,
  type SidebarNavGroup,
  type SidebarNavItem,
} from "@/lib/layout/sidebar-items";
import {
  isSidebarMoreActive,
  resolveSidebarActiveId,
} from "@/lib/layout/sidebar-nav";

import { AtlasTopActions } from "./atlas-top-actions";

type AtlasSidebarProps = {
  active?: AtlasNavPage;
};

function NavLink({
  item,
  isActive,
  onNavigate,
}: {
  item: SidebarNavItem;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex min-h-[44px] items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition-colors duration-[var(--motion-fast)] focus-ring",
        isActive
          ? "bg-[var(--accent-muted)] font-medium text-[var(--accent)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--accent-muted)] hover:text-[var(--accent)]",
      )}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-base leading-none" aria-hidden>
        {item.icon}
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function MoreSection({
  groups,
  active,
  moreExpanded,
  onToggleMore,
  onNavigate,
}: {
  groups: SidebarNavGroup[];
  active: AtlasNavPage | null;
  moreExpanded: boolean;
  onToggleMore: () => void;
  onNavigate?: () => void;
}) {
  const moreActive = isSidebarMoreActive(active);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onToggleMore}
        className={cn(
          "flex w-full min-h-[44px] items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition-colors duration-[var(--motion-fast)] focus-ring",
          moreActive
            ? "bg-[var(--accent-muted)] font-medium text-[var(--accent)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--accent-muted)] hover:text-[var(--accent)]",
        )}
        aria-expanded={moreExpanded}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center text-base leading-none" aria-hidden>
          📌
        </span>
        <span className="flex-1 truncate text-left">{ui.nav.more}</span>
        <span
          className={cn(
            "text-xs text-[var(--text-muted)] transition-transform duration-[var(--motion-fast)]",
            moreExpanded && "rotate-180",
          )}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {moreExpanded && (
        <div className="ml-2 space-y-3 border-l border-[var(--border-subtle)] pl-2 animate-fade-in">
          {groups.map((group, index) => (
            <div key={group.label ?? `group-${index}`} className="space-y-1">
              {group.label && (
                <p className="px-3 py-1 text-[11px] font-medium tracking-wide text-[var(--text-muted)]">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  isActive={active === item.id}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ))}
          <OwnerNavLink className="flex min-h-[44px] items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--accent-muted)] hover:text-[var(--accent)]" />
        </div>
      )}
    </div>
  );
}

function SidebarPanel({
  active,
  moreExpanded,
  onToggleMore,
  onNavigate,
  onClose,
  showCloseButton,
}: {
  active: AtlasNavPage | null;
  moreExpanded: boolean;
  onToggleMore: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
  showCloseButton?: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-4">
        <Link
          href="/projects"
          onClick={onNavigate}
          className="text-base font-semibold tracking-tight text-foreground focus-ring rounded-md"
        >
          {ui.brand}
        </Link>
        {showCloseButton && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="touch-target flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent-muted)] hover:text-[var(--accent)] focus-ring"
            aria-label={ui.nav.closeSidebar}
          >
            ✕
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="メイン">
        <div className="space-y-1">
          {SIDEBAR_PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={active === item.id}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        <div className="my-4 border-t border-[var(--border-subtle)]" />

        <MoreSection
          groups={SIDEBAR_MORE_GROUPS}
          active={active}
          moreExpanded={moreExpanded}
          onToggleMore={onToggleMore}
          onNavigate={onNavigate}
        />
      </nav>
    </div>
  );
}

export function AtlasSidebar({ active: activeProp }: AtlasSidebarProps) {
  const pathname = usePathname() ?? "";
  const resolvedActive = activeProp ?? resolveSidebarActiveId(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreExpanded, setMoreExpanded] = useState(() =>
    isSidebarMoreActive(resolvedActive),
  );

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    if (isSidebarMoreActive(resolvedActive)) {
      setMoreExpanded(true);
    }
  }, [resolvedActive]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobile();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [mobileOpen, closeMobile]);

  return (
    <>
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-[var(--mobile-top-bar-height)] items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--card-glass)] px-3 backdrop-blur-xl md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="touch-target flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent-muted)] hover:text-[var(--accent)] focus-ring"
          aria-label={ui.nav.openSidebar}
          aria-expanded={mobileOpen}
        >
          ☰
        </button>
        <Link
          href="/projects"
          className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground focus-ring rounded-md"
        >
          {ui.brand}
        </Link>
        <div className="ml-auto shrink-0">
          <AtlasTopActions />
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] border-r border-[var(--border-subtle)] bg-[var(--card-glass)] backdrop-blur-xl md:flex md:flex-col"
        aria-label={ui.nav.menu}
      >
        <SidebarPanel
          active={resolvedActive}
          moreExpanded={moreExpanded}
          onToggleMore={() => setMoreExpanded((value) => !value)}
        />
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] animate-fade-in md:hidden"
          aria-label={ui.nav.closeSidebar}
          onClick={closeMobile}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[min(85vw,var(--sidebar-width))] border-r border-[var(--border-subtle)] bg-[var(--card)] shadow-[var(--shadow-lg)] transition-transform duration-[var(--motion-base)] md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full pointer-events-none",
        )}
        aria-label={ui.nav.menu}
        aria-hidden={!mobileOpen}
      >
        <SidebarPanel
          active={resolvedActive}
          moreExpanded={moreExpanded}
          onToggleMore={() => setMoreExpanded((value) => !value)}
          onNavigate={closeMobile}
          onClose={closeMobile}
          showCloseButton
        />
      </aside>
    </>
  );
}

/** @deprecated Import from `@/lib/layout/nav-types` instead. */
export type { AtlasNavPage } from "@/lib/layout/nav-types";
