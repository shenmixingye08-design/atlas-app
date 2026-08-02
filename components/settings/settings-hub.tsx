"use client";

import Link from "next/link";

import { PageHeader } from "@/components/automation-first/page-header";
import { useFeatureAvailability } from "@/lib/feature-flags";

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

export function SettingsHub({
  legacy,
}: {
  legacy: React.ReactNode;
}) {
  const { flags, loading } = useFeatureAvailability();
  const hubEnabled =
    !loading &&
    (flags.automation_design_system_enabled === true ||
      flags.automation_first_home_enabled === true);

  if (!hubEnabled) {
    return <>{legacy}</>;
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <PageHeader
        eyebrow="MINERVOT"
        title="設定"
        description="アカウント・自動化・通知・記憶・連携・料金を分けて管理します。"
      />
      <div className="space-y-8">
        {GROUPS.map((group) => (
          <section key={group.id} aria-labelledby={`settings-${group.id}`}>
            <h2
              id={`settings-${group.id}`}
              className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
            >
              {group.title}
            </h2>
            <ul className="mt-3 divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)]">
              {group.links.map((link) => (
                <li key={`${group.id}:${link.href}:${link.title}`}>
                  <Link
                    href={link.href}
                    className="flex min-h-[var(--touch-target)] flex-col justify-center px-4 py-3 transition-colors hover:bg-[var(--surface-muted)]"
                  >
                    <span className="font-medium text-[var(--text-primary)]">
                      {link.title}
                    </span>
                    <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {link.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <details className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">
          従来の設定一覧も見る
        </summary>
        <div className="mt-4">{legacy}</div>
      </details>
    </div>
  );
}
