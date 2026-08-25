"use client";

import { useMemo, useState } from "react";

import { NotificationList } from "@/components/notifications/notification-list";
import { PageHeader } from "@/components/automation-first/page-header";
import { SegmentedControl } from "@/components/motion/segmented";
import { useFeatureAvailability } from "@/lib/feature-flags";
import type { NoticeFilter } from "@/lib/notifications/display";
import { ui } from "@/lib/i18n";

type InboxTab = "attention" | "completed" | "info";

const TAB_TO_FILTER: Record<InboxTab, NoticeFilter> = {
  attention: "needs_review",
  completed: "completed",
  info: "all",
};

const TABS: Array<{ id: InboxTab; label: string }> = [
  { id: "attention", label: "対応が必要" },
  { id: "completed", label: "完了" },
  { id: "info", label: "情報" },
];

/**
 * Automation First notification framing.
 * Falls back to classic list header when design-system flag is off.
 */
export function NotificationInbox() {
  const { flags, loading } = useFeatureAvailability();
  const enabled =
    !loading &&
    (flags.automation_design_system_enabled === true ||
      flags.automation_first_home_enabled === true);
  const [tab, setTab] = useState<InboxTab>("attention");
  const filter = useMemo(() => TAB_TO_FILTER[tab], [tab]);

  if (!enabled) {
    return (
      <div className="space-y-8">
        <header className="space-y-3">
          <p className="text-caption text-accent">{ui.brand}</p>
          <h1 className="text-display text-foreground">{ui.notifications.title}</h1>
          <p className="text-body max-w-2xl text-[var(--text-secondary)]">
            {ui.notifications.pageSubtitle}
          </p>
        </header>
        <NotificationList />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="MINERVOT"
        title="通知"
        description="対応が必要な確認から、完了・情報まで分けて確認できます。"
      />
      <SegmentedControl
        options={TABS}
        value={tab}
        onChange={setTab}
        ariaLabel="通知の種類"
        variant="brand"
      />
      <NotificationList key={filter} initialFilter={filter} />
    </div>
  );
}
