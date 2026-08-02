import type { OnboardingTaskId } from "@/lib/user-profile/types";

import type { QuickWinDefinition, RetentionRoleId } from "./types";

export const RETENTION_ROLES: readonly {
  id: RetentionRoleId;
  label: string;
  hint: string;
  defaultTasks: OnboardingTaskId[];
}[] = [
  {
    id: "sales",
    label: "営業",
    hint: "資料・見積・メール・議事録",
    defaultTasks: ["sales_material", "email"],
  },
  {
    id: "sns",
    label: "SNS / マーケ",
    hint: "X投稿・ブログ・画像",
    defaultTasks: ["sns", "blog"],
  },
  {
    id: "office",
    label: "事務 / 管理",
    hint: "日報・議事録・請求・ファイル",
    defaultTasks: ["files", "schedule", "company"],
  },
  {
    id: "executive",
    label: "経営 / マネジメント",
    hint: "週次報告・議事録・改善提案",
    defaultTasks: ["company", "sales_material", "schedule"],
  },
  {
    id: "freelance",
    label: "個人事業 / フリーランス",
    hint: "提案資料・請求・SNS",
    defaultTasks: ["sales_material", "sns", "email"],
  },
  {
    id: "other",
    label: "その他",
    hint: "まず一つ、仕事を終わらせます",
    defaultTasks: ["sales_material"],
  },
] as const;

/**
 * Guaranteed first deliverable path.
 * All roles funnel to the proven weekly Word activation so Day1 never ends as setup-only.
 * Copy/labels vary by role; artifact generation stays on the trusted path.
 */
export const QUICK_WIN_CATALOG: readonly QuickWinDefinition[] = [
  {
    id: "weekly_sales_report_word",
    title: "営業週次レポート（Word）",
    description: "外部連携なしで、最初の成果物を今すぐ受け取ります。",
    href: "/activation/weekly-report",
    deliverableLabel: "営業週次レポート.docx",
    roleIds: ["sales", "executive", "freelance", "other"],
    taskIds: ["sales_material", "company", "undecided"],
  },
  {
    id: "sns_content_pack",
    title: "SNS向け初回成果物",
    description: "まず仕事完了体験として週次レポートWordを作成し、次に投稿自動化へ進みます。",
    href: "/activation/weekly-report",
    deliverableLabel: "初回成果物.docx",
    roleIds: ["sns"],
    taskIds: ["sns", "blog"],
  },
  {
    id: "office_daily_pack",
    title: "事務向け初回成果物",
    description: "日報・議事録の型として、まずWord成果物を完成させます。",
    href: "/activation/weekly-report",
    deliverableLabel: "業務レポート.docx",
    roleIds: ["office"],
    taskIds: ["files", "schedule", "email"],
  },
] as const;

export function resolveQuickWin(input: {
  roleId?: RetentionRoleId | null;
  preferredTasks?: OnboardingTaskId[];
}): QuickWinDefinition {
  const roleId = input.roleId ?? "sales";
  const byRole = QUICK_WIN_CATALOG.find((item) => item.roleIds.includes(roleId));
  if (byRole) return byRole;

  const tasks = input.preferredTasks ?? [];
  const byTask = QUICK_WIN_CATALOG.find((item) =>
    item.taskIds.some((taskId) => tasks.includes(taskId)),
  );
  return byTask ?? QUICK_WIN_CATALOG[0]!;
}

export function roleDefaults(roleId: RetentionRoleId): OnboardingTaskId[] {
  return (
    RETENTION_ROLES.find((role) => role.id === roleId)?.defaultTasks ?? [
      "sales_material",
    ]
  );
}

export const RETENTION_INTEGRATIONS: readonly {
  id: "google" | "dropbox" | "x" | "email" | "calendar";
  label: string;
  href: string;
}[] = [
  { id: "google", label: "Google", href: "/settings/google/drive" },
  { id: "dropbox", label: "Dropbox", href: "/settings" },
  { id: "x", label: "X", href: "/settings/x" },
  { id: "email", label: "メール", href: "/settings/google/gmail" },
  { id: "calendar", label: "カレンダー", href: "/settings/google/calendar" },
] as const;
