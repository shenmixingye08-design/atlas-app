import { ui } from "@/lib/i18n";

import type { AtlasNavPage } from "./nav-types";

export type SidebarNavItem = {
  id: AtlasNavPage;
  href: string;
  label: string;
  icon: string;
};

export type SidebarNavGroup = {
  /** Optional subsection label inside 「その他」 (e.g. 連携・投稿). */
  label?: string;
  items: SidebarNavItem[];
};

/** Primary sidebar destinations — always visible in the main list. */
export const SIDEBAR_PRIMARY_NAV: SidebarNavItem[] = [
  { id: "projects", href: "/projects", label: ui.nav.home, icon: "🏠" },
  { id: "history", href: "/history", label: ui.nav.work, icon: "📋" },
  { id: "automations", href: "/automations", label: ui.nav.automation, icon: "🤖" },
  { id: "deliverables", href: "/deliverables", label: ui.nav.deliverables, icon: "📁" },
  { id: "settings", href: "/settings", label: ui.nav.settings, icon: "⚙️" },
];

/**
 * Social / channel integrations under 「その他」.
 * Add one entry per real route — do not add placeholder links.
 */
export const SIDEBAR_CHANNEL_NAV: SidebarNavItem[] = [
  { id: "x-autopost", href: "/workspace/x", label: ui.nav.xAutopost, icon: "𝕏" },
];

/** Secondary routes grouped under 「その他」. */
export const SIDEBAR_MORE_NAV: SidebarNavItem[] = [
  { id: "work-memory", href: "/learned-jobs", label: ui.nav.workMemory, icon: "📚" },
  { id: "learning", href: "/settings/learning", label: ui.nav.analysis, icon: "📊" },
  { id: "billing", href: "/settings/billing", label: ui.nav.billingCredits, icon: "💳" },
  { id: "contact", href: "/contact", label: ui.nav.contact, icon: "✉️" },
  { id: "help", href: "/capabilities", label: ui.nav.help, icon: "❓" },
];

/** Extensible 「その他」 section — channels first, then secondary routes. */
export const SIDEBAR_MORE_GROUPS: SidebarNavGroup[] = [
  { label: ui.nav.integrationsPost, items: SIDEBAR_CHANNEL_NAV },
  { items: SIDEBAR_MORE_NAV },
];
