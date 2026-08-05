/** Quick-start presets for the workspace request form. */
export type QuickRequestPreset = {
  id: string;
  label: string;
  prompt: string;
  /** When set, navigate instead of filling the textarea. */
  href?: string;
};

/**
 * Work-intent presets — never format pickers ("Wordを作る" etc.).
 * Tap fills the prompt; secretary chooses formats/steps.
 */
export const QUICK_REQUEST_PRESETS: readonly QuickRequestPreset[] = [
  {
    id: "sales-pack",
    label: "営業資料を用意",
    prompt:
      "営業資料を作って、共有しやすい形に整えてください。目的・課題・提案・効果・次のアクションが伝わる構成にしてください。",
  },
  {
    id: "invoice-summary",
    label: "請求をまとめる",
    prompt:
      "請求書や明細を整理して、金額・取引先・期日が分かる一覧にまとめてください。添付がある場合は内容を読み取って反映してください。",
  },
  {
    id: "minutes",
    label: "議事録を残す",
    prompt:
      "会議の議事録を作成して保存できる形にしてください。出席者・議題・決定事項・アクションアイテム（担当と期限）を整理してください。",
  },
  {
    id: "sales-email",
    label: "営業メールを用意",
    prompt:
      "見込み顧客向けの営業メール文を用意してください。件名案と本文を含め、相手の課題に寄り添いつつ次の一歩を促してください。送信はまだせず、確認できる形でお願いします。",
  },
  {
    id: "photo-report",
    label: "写真から報告書",
    prompt:
      "添付した画像の内容を読み取り、仕事で使える短い報告書にまとめて保存できる形にしてください。",
  },
  {
    id: "weekly-report",
    label: "週次報告を作る",
    prompt:
      "今週の週次報告を作成してください。進捗・課題・来週の予定が分かる構成にし、確認しやすい形に整えてください。",
  },
] as const;
