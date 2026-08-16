import type { QuickRequestPreset } from "@/lib/workspace/quick-request-presets";

/** Home quick-start cards — work-focused labels only. */
export const HOME_FREQUENT_WORK_PRESETS: readonly QuickRequestPreset[] = [
  {
    id: "sns",
    label: "今日のX投稿",
    prompt: "今日のX投稿を3案作って",
  },
  {
    id: "blog",
    label: "Excelにまとめる",
    prompt: "このデータをExcelにまとめて",
  },
  {
    id: "sales",
    label: "PowerPoint",
    prompt: "営業資料をPowerPointで作ってください",
  },
  {
    id: "email",
    label: "取引先メール",
    prompt: "この内容を取引先へのメールにして",
  },
  {
    id: "automation",
    label: "毎週自動実行",
    prompt: "毎週この作業を自動で実行して",
    href: "/automations?create=1",
  },
  {
    id: "files",
    label: "ファイル整理",
    prompt: "Google Drive内の資料フォルダを整理してください",
    href: "/workspace/drive",
  },
  {
    id: "consult",
    label: "予定を登録",
    prompt: "来週の予定をカレンダーに登録して",
    href: "/chat",
  },
] as const;

export const HOME_FREQUENT_WORK_ICONS: Record<string, string> = {
  sns: "📱",
  blog: "📝",
  sales: "📊",
  email: "✉️",
  automation: "🔁",
  files: "📁",
  consult: "💬",
};
