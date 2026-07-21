/**
 * Common request templates for the work-request form.
 * Tapping a template fills a concrete prompt example — no AI call required.
 */

export type RequestTemplate = {
  id: string;
  label: string;
  /** Prompt example inserted into the assignment field. */
  prompt: string;
};

export const REQUEST_TEMPLATES: readonly RequestTemplate[] = [
  {
    id: "x-post",
    label: "X投稿を作る",
    prompt:
      "X（Twitter）向けの投稿文を3案作成してください。トーンは親しみやすく、140字前後で、ハッシュタグを2つまで付けてください。テーマは最近のサービス改善のお知らせです。",
  },
  {
    id: "blog",
    label: "ブログを書く",
    prompt:
      "ブログ記事を1本書いてください。読者は忙しいビジネスパーソンです。構成は導入・本文・まとめ、見出し付き、約1500字。タイトル案も3つ添えてください。",
  },
  {
    id: "sales-email",
    label: "営業メール作成",
    prompt:
      "新規顧客向けの営業メールを作成してください。件名と本文を用意し、丁寧で簡潔に、次のアクション（打ち合わせ候補）が明確になるようにしてください。",
  },
  {
    id: "materials",
    label: "資料作成",
    prompt:
      "社内向けの説明資料の骨子と本文を作成してください。目的・現状・提案・次のステップが分かる構成にし、スライド見出し案も付けてください。",
  },
  {
    id: "minutes",
    label: "議事録作成",
    prompt:
      "会議の議事録を作成してください。議題・決定事項・宿題（担当と期限）・次回予定を整理し、共有しやすい短文にしてください。メモがあればそれを元にまとめてください。",
  },
  {
    id: "market-research",
    label: "市場調査",
    prompt:
      "指定テーマの市場調査サマリーを作成してください。市場規模の見立て、競合の特徴、機会とリスク、今日から使える示唆を箇条書きでまとめてください。",
  },
  {
    id: "image-gen",
    label: "画像生成",
    prompt:
      "SNS投稿用の画像コンセプトと生成用プロンプトを作成してください。用途・トーン・構図・色・入れたい文字を明確にし、そのまま画像生成に使える指示文にしてください。",
  },
] as const;
