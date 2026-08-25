"use client";

import { SegmentedControl } from "@/components/motion/segmented";
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
    <SegmentedControl
      options={tabs}
      value={activeId}
      onChange={onChange}
      className={cn(className)}
    />
  );
}
