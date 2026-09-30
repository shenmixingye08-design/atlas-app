"use client";

import Link from "next/link";
import { useEffect } from "react";

import { PageHeader } from "@/components/automation-first/page-header";
import { RevealStagger } from "@/components/motion/reveal-stagger";
import {
  IconAlert,
  IconArtifact,
  IconAutomation,
  IconBell,
  IconLink,
  IconSettings,
  IconSpark,
  IconUser,
} from "@/components/ui/icons";
import { useFeatureAvailability } from "@/lib/feature-flags";
import { MOTION_PLAY_KEYS } from "@/lib/motion/tokens";

type SettingsLink = {
  href: string;
  title: string;
  description: string;
};

type SettingsGroup = {
  id: string;
  title: string;
  links: SettingsLink[];
};

const GROUPS: SettingsGroup[] = [
  {
    id: "account",
    title: "アカウント",
    links: [
      {
        href: "/settings/account",
        title: "アカウント情報",
        description: "ログイン・プロフィール",
      },
    ],
  },
  {
    id: "automation",
    title: "自動化",
    links: [
      {
        href: "/automations",
        title: "自動化一覧",
        description: "稼働・一時停止・次回実行",
      },
      {
        href: "/settings/learning",
        title: "改善提案",
        description: "過去の修正から次の進め方を提案",
      },
    ],
  },
  {
    id: "notifications",
    title: "通知",
    links: [
      {
        href: "/settings/notifications",
        title: "通知の受け取り方",
        description: "確認待ち・完了・お知らせ",
      },
      {
        href: "/notifications",
        title: "通知一覧",
        description: "対応が必要な項目を確認",
      },
    ],
  },
  {
    id: "memory",
    title: "記憶",
    links: [
      {
        href: "/settings/memory",
        title: "MINERVOTが覚えていること",
        description: "文体・保存先・承認の好み",
      },
      {
        href: "/settings/work-memory",
        title: "仕事の記憶",
        description: "覚えた仕事の扱い",
      },
    ],
  },
  {
    id: "artifacts",
    title: "成果物",
    links: [
      {
        href: "/history",
        title: "実行履歴と成果物",
        description: "いつ・何が・どこへ",
      },
      {
        href: "/settings/export",
        title: "データの書き出し",
        description: "エクスポート",
      },
    ],
  },
  {
    id: "integrations",
    title: "外部連携",
    links: [
      {
        href: "/settings/google/drive",
        title: "Google Drive",
        description: "保存先の接続",
      },
      {
        href: "/settings/google/gmail",
        title: "Gmail",
        description: "メール連携",
      },
      {
        href: "/settings/google/calendar",
        title: "Google Calendar",
        description: "予定連携",
      },
      {
        href: "/settings/x",
        title: "X",
        description: "投稿連携",
      },
      {
        href: "/settings/wordpress",
        title: "WordPress",
        description: "ブログ連携",
      },
    ],
  },
  {
    id: "billing",
    title: "料金・利用量",
    links: [
      {
        href: "/settings/billing",
        title: "お支払いと利用量",
        description: "プラン・クレジット",
      },
    ],
  },
  {
    id: "privacy",
    title: "プライバシー・セキュリティ・データ削除",
    links: [
      {
        href: "/settings/account",
        title: "データ削除・セキュリティ",
        description: "アカウント設定から管理",
      },
      {
        href: "/privacy",
        title: "プライバシーポリシー",
        description: "取り扱いの説明",
      },
    ],
  },
];

const GROUP_ICON: Record<string, (props: { className?: string }) => React.ReactNode> = {
  account: IconUser,
  automation: IconAutomation,
  notifications: IconBell,
  memory: IconSpark,
  artifacts: IconArtifact,
  integrations: IconLink,
  billing: IconSettings,
  privacy: IconAlert,
};

export function SettingsHub({
  legacy,
  forceEnabled = false,
}: {
  legacy: React.ReactNode;
  /** DEV preview can force the hub without waiting for feature flags. */
  forceEnabled?: boolean;
}) {
  const { flags, loading } = useFeatureAvailability();
  const hubEnabled =
    forceEnabled ||
    (!loading &&
      (flags.automation_design_system_enabled === true ||
        flags.automation_first_home_enabled === true));

  // Hub renders after flags load, so the browser's own #hash jump can miss
  // (e.g. 連携 → /settings#settings-integrations). Scroll once it exists.
  useEffect(() => {
    if (!hubEnabled) return;
    const id = window.location.hash.slice(1);
    if (!id.startsWith("settings-")) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [hubEnabled]);

  if (!hubEnabled) {
    return <>{legacy}</>;
  }

  return (
    <RevealStagger playKey={MOTION_PLAY_KEYS.settingsIntro} className="space-y-8">
      <PageHeader
        eyebrow="MINERVOT"
        title="設定"
        description="アカウント・自動化・通知・記憶・連携・料金を分けて管理します。"
      />
      <div className="grid grid-cols-1 gap-x-8 gap-y-7 lg:grid-cols-2">
        {GROUPS.map((group) => {
          const Icon = GROUP_ICON[group.id] ?? IconSettings;
          return (
            <section key={group.id} aria-labelledby={`settings-${group.id}`}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="ui-icon-tile h-8 w-8 rounded-[0.625rem]" aria-hidden>
                  <Icon className="h-4 w-4" />
                </span>
                <h2 id={`settings-${group.id}`} className="ui-section-title scroll-mt-24">
                  {group.title}
                </h2>
              </div>
              <ul className="ui-card ui-list">
                {group.links.map((link) => (
                  <li key={`${group.id}:${link.href}:${link.title}`}>
                    <Link
                      href={link.href}
                      className="motion-press ui-row ui-row-link focus-ring min-h-[var(--touch-target)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[var(--text-primary)]">
                          {link.title}
                        </span>
                        <span className="block text-[length:var(--text-caption)] text-[var(--text-muted)]">
                          {link.description}
                        </span>
                      </span>
                      <span aria-hidden className="ui-chevron">
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <details className="ui-card px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">
          従来の設定一覧も見る
        </summary>
        <div className="mt-4">{legacy}</div>
      </details>
    </RevealStagger>
  );
}
