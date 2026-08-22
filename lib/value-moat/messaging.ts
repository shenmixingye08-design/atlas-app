/**
 * VALUE MOAT copy — why users keep using MINERVOT.
 * Honest: no "完全放置" / "何でも自動" / "全部覚える".
 */

export const VALUE_MOAT_HEADLINE =
  "あなたの仕事を覚えて、次から終わらせるAI秘書。";

export const VALUE_MOAT_SUBHEAD =
  "毎日のX投稿も、いつもの報告書も、一度やり方を教えれば次から細かい説明を減らせます。";

export const VALUE_MOAT_REASONS = [
  "一度頼めば、次から同じ説明はいりません。",
  "一度直せば、次からその好みに近づきます。",
  "一度型を作れば、次から“今月分も”で作れます。",
  "作るだけでなく、実行・保存まで終わらせます。",
] as const;

export const NEW_USER_FIRST_CTA = "最初の仕事を任せる";

export const NEW_USER_VALUE_STEPS = [
  { id: "ask-once", title: "一度頼む", body: "最初の仕事のやり方を教える" },
  { id: "remember", title: "好みを覚える", body: "直した文体・形式だけを残す" },
  {
    id: "easier-next",
    title: "次からもっと楽になる",
    body: "同じ説明を繰り返さなくてよくなる",
  },
] as const;

export const HOME_RETURNING_HEADLINE = "前に頼んだ仕事を、次から楽にする";

export const HOME_NEW_USER_HEADLINE = "一度頼めば、次から細かい説明を減らせます";

export const GENERAL_AI_FLOW = [
  "毎回説明",
  "生成",
  "人がコピー",
  "人が実行",
] as const;

export const MINERVOT_FLOW = [
  "一度教える",
  "覚える",
  "次から再利用",
  "対応業務では実行まで",
] as const;

export const FORBIDDEN_VALUE_CLAIMS = [
  "完全放置",
  "何でも自動",
  "全部覚える",
  "なんでもできます",
] as const;

export const PREFERENCE_APPLIED_NOTICE = "前回の好みを反映しました";
