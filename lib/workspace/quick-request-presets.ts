/** Quick-start presets for the workspace request form. */
export type QuickRequestPreset = {
  id: string;
  label: string;
  prompt: string;
  /** When set, navigate instead of filling the textarea. */
  href?: string;
};

/**
 * 実装済みの実ファイル作成に寄せたテンプレート。
 * 画像生成・未検証の外部投稿を先頭に置かない。
 */
export const QUICK_REQUEST_PRESETS: readonly QuickRequestPreset[] = [
  {
    id: "sales-excel",
    label: "売上表をExcelで",
    prompt:
      "今月の売上管理表をExcelで作ってください。商品・数量・単価・金額・合計が分かる表にしてください。",
  },
  {
    id: "pitch-pptx",
    label: "営業資料をPowerPointで",
    prompt:
      "新規顧客向けの営業説明資料をPowerPointで作ってください。課題・提案・価格・次のアクションを含めてください。",
  },
  {
    id: "minutes-docx",
    label: "議事録をWordで",
    prompt:
      "会議の議事録をWordで作成してください。出席者・議題・決定事項・アクションアイテム（担当と期限）を整理してください。",
  },
  {
    id: "receipt-excel",
    label: "レシートをExcelに",
    prompt:
      "添付のレシートを読み取り、日付・店名・金額・支払方法をExcelの表に整理してください。家計簿アプリへの自動追記は不要です。",
  },
  {
    id: "report-pdf",
    label: "報告書をPDFで",
    prompt:
      "現場向けの作業報告書をWordで作成し、提出用にPDFでも欲しいです。日時・場所・作業内容・結果を含めてください。",
  },
  {
    id: "x-draft",
    label: "X投稿文を作る",
    prompt:
      "X（Twitter）向けの投稿文を3案作ってください。読者の興味を引く書き出しと、行動を促す一文を含めてください。投稿の自動送信は不要です。",
  },
] as const;
