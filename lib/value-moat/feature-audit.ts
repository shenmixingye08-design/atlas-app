/**
 * Using-reason audit. Honest A/B/C — never inflate to A without a moat hook.
 */

export type FeatureGrade = "A" | "B" | "C";

export type FeatureAuditRow = {
  id: string;
  label: string;
  grade: FeatureGrade;
  reason: string;
  moatHooks: readonly string[];
};

export const VALUE_MOAT_FEATURE_AUDIT: readonly FeatureAuditRow[] = [
  {
    id: "x",
    label: "X",
    grade: "A",
    reason: "一度設定すれば予約枠で原稿〜投稿まで終わる。再指示不要。",
    moatHooks: ["Automation", "Memory", "実行", "履歴", "通知"],
  },
  {
    id: "automation",
    label: "Automation",
    grade: "A",
    reason: "live連携だけを初回設定・次回自動として扱う。偽成功なし。",
    moatHooks: ["Automation", "実行", "通知"],
  },
  {
    id: "memory",
    label: "Memory",
    grade: "A",
    reason: "明示指示 > Memory > Default。適用時だけ好み反映を出す。",
    moatHooks: ["Memory", "再利用"],
  },
  {
    id: "word",
    label: "Word",
    grade: "A",
    reason: "文体・見出し・形式を覚え、「今週分も」で新しいdocxを出す。",
    moatHooks: ["Memory", "再利用", "保存"],
  },
  {
    id: "excel",
    label: "Excel",
    grade: "A",
    reason: "列構成だけ再利用。前回の数字・個人情報はコピーしない。",
    moatHooks: ["Memory", "再利用", "保存"],
  },
  {
    id: "pdf",
    label: "PDF",
    grade: "A",
    reason: "構成・見出し・文体を再利用し、本文コピーによる偽装は禁止。",
    moatHooks: ["Memory", "再利用", "保存"],
  },
  {
    id: "pptx",
    label: "PPTX",
    grade: "A",
    reason: "枚数傾向とタイトル構成を再利用して新しいpptxを保存する。",
    moatHooks: ["Memory", "再利用", "保存"],
  },
  {
    id: "vision",
    label: "画像解析",
    grade: "B",
    reason: "読取りは強いが、家計簿Excelの列再利用と結びつくとAに近づく。",
    moatHooks: ["Memory", "再利用"],
  },
  {
    id: "gmail",
    label: "Gmail",
    grade: "B",
    reason: "下書き作成はlive。送信は承認契約があり、毎回ゼロからは減らせる。",
    moatHooks: ["Automation", "実行"],
  },
  {
    id: "calendar",
    label: "Calendar",
    grade: "B",
    reason: "予定作成はlive。週次まとめの自動完走はβ。",
    moatHooks: ["Automation", "実行"],
  },
  {
    id: "drive",
    label: "Google Drive",
    grade: "C",
    reason: "接続は可能だが単独Automation保存ステップとしては未対応。",
    moatHooks: [],
  },
  {
    id: "dropbox",
    label: "Dropbox",
    grade: "B",
    reason: "対応ワークフローでは保存まで実行できる。単体の習慣化は弱い。",
    moatHooks: ["実行", "保存"],
  },
  {
    id: "wordpress",
    label: "WordPress",
    grade: "B",
    reason: "投稿/下書きはlive。Memoryと定期実行が結びつくとAに近づく。",
    moatHooks: ["Automation", "実行"],
  },
  {
    id: "notify",
    label: "通知",
    grade: "A",
    reason: "終端成功のときだけ成功通知。生成成功だけでは出さない。",
    moatHooks: ["通知", "実行"],
  },
  {
    id: "history",
    label: "履歴",
    grade: "A",
    reason: "成功仕事を「もう一度」で新jobとして型再利用できる。",
    moatHooks: ["再利用", "履歴"],
  },
] as const;

export function gradeForFeature(id: string): FeatureGrade | null {
  return VALUE_MOAT_FEATURE_AUDIT.find((row) => row.id === id)?.grade ?? null;
}
