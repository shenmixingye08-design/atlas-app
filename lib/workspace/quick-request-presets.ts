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
    label: "X投稿を作る",
    prompt:
      "X（Twitter）向けの投稿文を3案作ってください。読者の興味を引く書き出しと、行動を促す一文を含めてください。",
  },
  {
    id: "blog",
    label: "ブログを書く",
    prompt:
      "ブログ記事の下書きを書いてください。見出し構成・導入・本文・まとめを含め、読みやすい文章にしてください。",
  },
  {
    id: "sales-email",
    label: "営業メール作成",
    prompt:
      "見込み顧客向けの営業メール文を作成してください。件名案と本文を用意し、相手の課題に寄り添いつつ次の一歩を促してください。",
  },
  {
    id: "materials",
    label: "資料作成",
    prompt:
      "営業資料を作ってください。目的・課題・提案・効果・次のアクションが伝わる構成にしてください。",
  },
  {
    id: "minutes",
    label: "議事録作成",
    prompt:
      "会議の議事録を作成してください。出席者・議題・決定事項・アクションアイテム（担当と期限）を整理してください。",
  },
  {
    id: "research",
    label: "市場調査",
    prompt:
      "指定テーマについて市場調査を行い、概況・競合・機会・リスク・おすすめアクションをまとめてください。",
  },
  {
    id: "image",
    label: "画像生成",
    prompt:
      "仕事で使える画像の生成指示とキャプション案を作ってください。用途・トーン・構図・避けたい要素を明確にしてください。",
  },
] as const;
