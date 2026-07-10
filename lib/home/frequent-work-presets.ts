import type { QuickRequestPreset } from "@/lib/workspace/quick-request-presets";

/** Home quick-start cards — work-focused labels only. */
export const HOME_FREQUENT_WORK_PRESETS: readonly QuickRequestPreset[] = [
  {
    id: "sns",
    label: "SNS投稿",
    prompt: "Xに投稿する文章を作ってください",
  },
  {
    id: "blog",
    label: "ブログ作成",
    prompt: "ブログ記事の下書きを作ってください",
  },
  {
    id: "sales",
    label: "営業資料",
    prompt: "営業資料を作ってください",
  },
  {
    id: "email",
    label: "メール返信",
    prompt: "顧客へのフォローアップメール文を作ってください",
  },
  {
    id: "automation",
    label: "定期仕事",
    prompt: "毎週月曜の朝9時に、前週の成果をまとめる定期業務を登録してください",
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
    label: "追加で依頼",
    prompt: "繰り返し作業を減らすため、まず何から任せるべきか教えてください",
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
