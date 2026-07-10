/** Quick-start presets for the workspace request form. */
export type QuickRequestPreset = {
  id: string;
  label: string;
  prompt: string;
  /** When set, navigate instead of filling the textarea. */
  href?: string;
};

export const QUICK_REQUEST_PRESETS: readonly QuickRequestPreset[] = [
  {
    id: "sns",
    label: "SNS投稿を作る",
    prompt: "Xに投稿する文章を作ってください",
  },
  {
    id: "blog",
    label: "ブログを書く",
    prompt: "ブログ記事の下書きを作ってください",
  },
  {
    id: "coconala",
    label: "ココナラ募集文を作る",
    prompt: "ココナラ用のサービス募集文を作ってください",
  },
  {
    id: "sales",
    label: "営業資料を作る",
    prompt: "営業資料を作ってください",
  },
  {
    id: "email",
    label: "メール文を作る",
    prompt: "顧客へのフォローアップメール文を作ってください",
  },
  {
    id: "automation",
    label: "定期業務を登録する",
    prompt: "毎週月曜の朝9時に、前週の成果をまとめる定期業務を登録してください",
    href: "/automations?create=1",
  },
  {
    id: "files",
    label: "ファイルを整理する",
    prompt: "Google Drive内のマーケティング資料フォルダを整理してください",
  },
  {
    id: "consult",
    label: "追加で依頼する",
    prompt: "繰り返し作業を減らすため、まず何から任せるべきか教えてください",
  },
] as const;
