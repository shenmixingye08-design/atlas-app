/** Quick-start presets for the workspace request form. */
export type QuickRequestPreset = {
  id: string;
  label: string;
  prompt: string;
  /** When set, navigate instead of filling the textarea. */
  href?: string;
};

/**
 * よく使うテンプレート — 依頼作成画面の主テンプレート。
 * タップでプロンプト例が入力欄に入り、そのまま編集できる。
 */
export const QUICK_REQUEST_PRESETS: readonly QuickRequestPreset[] = [
  {
    id: "x-post",
    label: "今日のX投稿",
    prompt: "今日のX投稿を3案作って",
  },
  {
    id: "x-daily-auto",
    label: "X投稿を自動化する",
    prompt: "毎朝10時にXへ投稿して",
    href: "/workspace/x",
  },
  {
    id: "sales-email",
    label: "取引先メール",
    prompt: "この内容を取引先へのメールにして",
  },
  {
    id: "minutes",
    label: "予定を登録",
    prompt: "来週の予定をカレンダーに登録して",
  },
  {
    id: "blog",
    label: "Excelにまとめる",
    prompt: "このデータをExcelにまとめて",
  },
  {
    id: "research",
    label: "毎週自動実行",
    prompt: "毎週この作業を自動で実行して",
  },
  {
    id: "materials",
    label: "PowerPoint資料",
    prompt:
      "営業資料をPowerPointで作ってください。目的・課題・提案・効果・次のアクションが伝わるスライド構成にしてください。",
  },
  // N-01: Do not expose an "画像生成" preset while Production image generation
  // is not an offered capability.
] as const;
