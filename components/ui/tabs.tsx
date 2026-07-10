"use client";

import { cn } from "@/lib/design-system/cn";

type Tab = { id: string; label: string };

type TabsProps = {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
};

export function Tabs({ tabs, activeId, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex gap-1 rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-1 ring-1 ring-[var(--border)]",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium transition-all duration-[var(--motion-fast)] focus-ring",
              isActive
                ? "bg-[var(--card)] text-foreground shadow-sm ring-1 ring-[var(--border)]"
                : "text-[var(--text-secondary)] hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
