import type { PlanId } from "@/lib/billing/plans/types";
import { getPlanDefinition } from "@/lib/billing/plans/registry";

import type { ActivationGoalId } from "./types";

export type ActivationGoalDefinition = {
  id: ActivationGoalId;
  title: string;
  summary: string;
  recommended: boolean;
  href: string;
  presetId?: string;
  assignmentTemplate: (draft: {
    theme?: string;
    audience?: string;
    tone?: string;
    count?: string;
    frequency?: string;
    hour?: string;
    assignment?: string;
  }) => string;
  requiredFeature?: "content_writing" | "sns_assist" | "sns_auto_post" | "google_integration";
  needsX?: boolean;
  needsGoogle?: boolean;
  steps: Array<{ id: string; label: string; hint: string }>;
  whatHappens: string;
};

export const ACTIVATION_GOALS: readonly ActivationGoalDefinition[] = [
  {
    id: "x_draft",
    title: "X投稿を作りたい",
    summary: "テーマを決めて投稿案を作り、確認するところまで進めます。",
    recommended: true,
    href: "/workspace",
    presetId: "x-post",
    requiredFeature: "sns_assist",
    assignmentTemplate: (draft) => {
      const theme = draft.theme?.trim() || "今日の仕事の気づき";
      const audience = draft.audience?.trim() || "同じ仕事をしている方";
      const tone = draft.tone?.trim() || "短く丁寧に";
      const count = draft.count?.trim() || "3";
      return `X向けの投稿文を${count}案作ってください。テーマは「${theme}」。読者は${audience}。文体は${tone}。投稿はせず、確認用の文案だけください。`;
    },
    steps: [
      { id: "theme", label: "テーマ", hint: "何について書くか" },
      { id: "audience", label: "読者", hint: "誰に届けるか" },
      { id: "tone", label: "文体", hint: "短い・丁寧など" },
      { id: "count", label: "作成数", hint: "1〜3案" },
      { id: "generate", label: "作成", hint: "依頼して案を作る" },
      { id: "review", label: "確認", hint: "結果を見て直す" },
    ],
    whatHappens:
      "X連携前でも投稿案の作成と確認ができます。投稿や予約のときに、理由を案内して接続します。",
  },
  {
    id: "x_autopost",
    title: "X投稿を定期的に自動化したい",
    summary: "テーマと頻度を決め、承認制か自動かを選んで保存します。",
    recommended: false,
    href: "/workspace/x",
    presetId: "x-daily-auto",
    requiredFeature: "sns_auto_post",
    needsX: true,
    assignmentTemplate: (draft) => {
      const theme = draft.theme?.trim() || "仕事の学び";
      const frequency = draft.frequency?.trim() || "毎日";
      const hour = draft.hour?.trim() || "10";
      return `${frequency}${hour}時に、テーマ「${theme}」のX投稿案を用意してください。`;
    },
    steps: [
      { id: "connect", label: "X連携", hint: "投稿するときだけ必要です" },
      { id: "theme", label: "テーマ", hint: "何を投稿するか" },
      { id: "frequency", label: "頻度", hint: "毎日・毎週" },
      { id: "approval", label: "確認方法", hint: "承認してから送るか" },
      { id: "save", label: "保存", hint: "自動化を1件保存" },
      { id: "review", label: "予約確認", hint: "次の実行を見る" },
    ],
    whatHappens:
      "保存した自動化は、選んだ時刻に案を用意します。承認制なら、投稿前に必ず確認できます。",
  },
  {
    id: "document",
    title: "文章や資料を作りたい",
    summary: "作りたいものと入力だけ書いて、資料を確認します。",
    recommended: false,
    href: "/workspace",
    presetId: "materials",
    requiredFeature: "content_writing",
    assignmentTemplate: (draft) =>
      draft.assignment?.trim() ||
      "短い営業資料の構成案を作ってください。目的・課題・提案・次の行動が分かるようにしてください。実在しない会社名は使わないでください。",
    steps: [
      { id: "kind", label: "作りたいもの", hint: "資料・メール・まとめ" },
      { id: "input", label: "入力", hint: "分かっている内容だけ" },
      { id: "generate", label: "作成", hint: "依頼する" },
      { id: "review", label: "確認", hint: "結果を開く" },
    ],
    whatHappens: "1回の依頼で資料案を作ります。完成後も、作成済みの内容は残ります。",
  },
  {
    id: "office_file",
    title: "Word／Excel／PDFを作りたい",
    summary: "表や文書を1つ作り、ダウンロードまで進めます。",
    recommended: false,
    href: "/workspace",
    presetId: "blog",
    requiredFeature: "content_writing",
    assignmentTemplate: (draft) =>
      draft.assignment?.trim() ||
      "簡単な週次報告をExcelで作ってください。項目は日付・内容・次の行動だけにしてください。架空の数値は入れないでください。",
    steps: [
      { id: "kind", label: "形式", hint: "Word / Excel / PDF" },
      { id: "input", label: "入力", hint: "入れたい項目" },
      { id: "generate", label: "作成", hint: "依頼する" },
      { id: "open", label: "開く", hint: "成果物を確認" },
    ],
    whatHappens: "実ファイルができるまで案内します。空のテスト文章にはしません。",
  },
  {
    id: "calendar",
    title: "予定を登録したい",
    summary: "予定の内容を書いて、カレンダーへ登録します。",
    recommended: false,
    href: "/workspace",
    presetId: "minutes",
    requiredFeature: "google_integration",
    needsGoogle: true,
    assignmentTemplate: (draft) =>
      draft.assignment?.trim() ||
      "来週の打ち合わせ予定をカレンダーに登録する文面を整えてください。日時が未定なら、確認用の下書きだけください。",
    steps: [
      { id: "what", label: "何をするか", hint: "予定の内容" },
      { id: "when", label: "いつ", hint: "分かれば日時" },
      { id: "connect", label: "カレンダー", hint: "登録するときだけ接続" },
      { id: "save", label: "登録", hint: "実処理まで進める" },
    ],
    whatHappens:
      "カレンダー連携は Standard 以上です。接続前に、使う権限と解除方法を案内します。",
  },
  {
    id: "recurring",
    title: "毎週・毎月の仕事を自動化したい",
    summary: "仕事・頻度・確認方法を決めて、自動化を1件保存します。",
    recommended: false,
    href: "/automations?create=1",
    presetId: "research",
    assignmentTemplate: (draft) => {
      const work = draft.assignment?.trim() || "今週の仕事の要点を短くまとめる";
      const frequency = draft.frequency?.trim() || "毎週";
      const hour = draft.hour?.trim() || "18";
      return `${frequency}${hour}時に、${work}。実行後は通知してください。`;
    },
    steps: [
      { id: "what", label: "何をするか", hint: "繰り返す仕事" },
      { id: "frequency", label: "頻度", hint: "毎週・毎月" },
      { id: "hour", label: "時刻", hint: "実行したい時間" },
      { id: "approval", label: "確認", hint: "実行前に見るか" },
      { id: "save", label: "保存", hint: "自動化を1件" },
    ],
    whatHappens: "Free では自動化を1件保存できます。初回成功まで案内します。",
  },
  {
    id: "try_request",
    title: "まず試しに依頼してみたい",
    summary: "いちばん短い依頼から、結果の確認まで進めます。",
    recommended: false,
    href: "/workspace",
    presetId: "x-post",
    requiredFeature: "content_writing",
    assignmentTemplate: (draft) =>
      draft.assignment?.trim() ||
      "今日のX投稿を3案作ってください。短く丁寧に。投稿はせず確認用だけください。",
    steps: [
      { id: "input", label: "入力", hint: "任せたい一文" },
      { id: "generate", label: "作成", hint: "依頼する" },
      { id: "review", label: "確認", hint: "結果を見る" },
    ],
    whatHappens: "無料枠の1回を、確認できる実成果に使います。",
  },
] as const;

const GOAL_BY_ID = Object.fromEntries(
  ACTIVATION_GOALS.map((goal) => [goal.id, goal]),
) as Record<ActivationGoalId, ActivationGoalDefinition>;

export function getActivationGoal(
  id: ActivationGoalId,
): ActivationGoalDefinition {
  return GOAL_BY_ID[id];
}

export function planHasFeature(
  planId: PlanId | string | null | undefined,
  feature: NonNullable<ActivationGoalDefinition["requiredFeature"]>,
): boolean {
  const plan = getPlanDefinition((planId as PlanId | undefined) ?? "free");
  return plan.limits.features.includes(feature);
}

export function listAvailableGoals(
  planId?: PlanId | string | null,
): ActivationGoalDefinition[] {
  return ACTIVATION_GOALS.filter((goal) => {
    if (!goal.requiredFeature) return true;
    return planHasFeature(planId, goal.requiredFeature);
  });
}

export function getRecommendedGoalId(
  planId: PlanId | string | null,
): ActivationGoalId {
  if (planHasFeature(planId, "sns_assist")) return "x_draft";
  return listAvailableGoals(planId).find((goal) => goal.recommended)?.id ?? "try_request";
}

export function buildQuickStartHref(
  goal: ActivationGoalDefinition,
  assignment: string,
): string {
  if (goal.href.startsWith("/automations") || goal.href.startsWith("/workspace/x")) {
    return goal.href;
  }
  const params = new URLSearchParams({
    assignment,
    activation: "1",
  });
  if (goal.presetId) params.set("preset", goal.presetId);
  return `${goal.href}?${params.toString()}`;
}
