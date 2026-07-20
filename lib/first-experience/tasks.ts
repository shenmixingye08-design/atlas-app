import type {
  FirstExperienceTaskDefinition,
  FirstExperienceTaskId,
} from "./types";

const BASE_EMPLOYEE_TAIL: FirstExperienceTaskDefinition["employeeSteps"] = [
  { icon: "📧", role: "秘書", status: "整理中" },
  { icon: "✅", role: "MINERVOT", status: "完了" },
];

export const FIRST_EXPERIENCE_TASKS: readonly FirstExperienceTaskDefinition[] = [
  {
    id: "sns",
    icon: "📱",
    label: "SNS投稿",
    jobCategory: "sns_post",
    assignment: "X向けの短いビジネス投稿文を1件作成してください。",
    leadEmployee: "SNS担当",
    saveLocation: "MINERVOT",
    deliverable: {
      title: "SNS投稿文",
      preview:
        "【今日のひとこと】\n毎日のルーティンをMINERVOTに任せると、投稿・資料・メールまで最後まで進みます。まずは1件、試してみませんか？",
      format: "テキスト",
    },
    employeeSteps: [
      { icon: "📱", role: "SNS担当", status: "分析中" },
      { icon: "📱", role: "SNS担当", status: "作成中" },
      ...BASE_EMPLOYEE_TAIL,
    ],
    nextIntegration: { label: "X連携しましょう", href: "/settings/x" },
    onboardingTaskId: "sns",
  },
  {
    id: "blog",
    icon: "📝",
    label: "ブログ",
    jobCategory: "blog",
    assignment: "短いブログ記事の下書きを作成してください。",
    leadEmployee: "ブログ担当",
    saveLocation: "MINERVOT",
    deliverable: {
      title: "ブログ下書き",
      preview:
        "## MINERVOTで毎日の仕事を最後まで\n\n登録から公開・保存まで自動化。まずは下書きを任せて、確認するだけで進められます。",
      format: "Markdown",
    },
    employeeSteps: [
      { icon: "📝", role: "ブログ担当", status: "分析中" },
      { icon: "📝", role: "ブログ担当", status: "作成中" },
      { icon: "📄", role: "資料担当", status: "確認中" },
      ...BASE_EMPLOYEE_TAIL.slice(1),
    ],
    nextIntegration: { label: "WordPressを連携しましょう", href: "/settings" },
    onboardingTaskId: "blog",
  },
  {
    id: "sales_material",
    icon: "📄",
    label: "営業資料",
    jobCategory: "sales_material",
    assignment: "1枚構成の営業資料アウトラインを作成してください。",
    leadEmployee: "資料担当",
    saveLocation: "Google Drive（連携後）",
    deliverable: {
      title: "営業資料アウトライン",
      preview:
        "1. 課題提起\n2. 解決策\n3. 導入効果\n4. 次のアクション\n— PowerPoint化もMINERVOTが担当できます。",
      format: "アウトライン",
    },
    employeeSteps: [
      { icon: "📄", role: "資料担当", status: "分析中" },
      { icon: "📄", role: "資料担当", status: "作成中" },
      { icon: "📝", role: "ブログ担当", status: "確認中" },
      ...BASE_EMPLOYEE_TAIL.slice(1),
    ],
    nextIntegration: {
      label: "Google Driveを連携しましょう",
      href: "/settings/google/drive",
    },
    onboardingTaskId: "sales_material",
  },
  {
    id: "email",
    icon: "📧",
    label: "メール整理",
    jobCategory: "email",
    assignment: "顧客へのフォローアップメールの返信下書きを作成してください。",
    leadEmployee: "秘書",
    saveLocation: "Gmail（連携後）",
    deliverable: {
      title: "メール返信下書き",
      preview:
        "件名：Re: ご提案の件\n\nお世話になっております。ご連絡ありがとうございます。詳細を確認のうえ、改めてご返信いたします。",
      format: "メール下書き",
    },
    employeeSteps: [
      { icon: "📧", role: "秘書", status: "分析中" },
      { icon: "📧", role: "秘書", status: "作成中" },
      ...BASE_EMPLOYEE_TAIL.slice(1),
    ],
    nextIntegration: { label: "Gmailを連携しましょう", href: "/settings/google/gmail" },
    onboardingTaskId: "email",
  },
  {
    id: "ai_chat",
    icon: "📝",
    label: "追加依頼",
    jobCategory: "generic",
    assignment: "繰り返し作業を減らすため、最初に任せるべき仕事を提案してください。",
    leadEmployee: "MINERVOT",
    saveLocation: "MINERVOT",
    deliverable: {
      title: "依頼への回答",
      preview:
        "まずは繰り返しの仕事を1つ選び、MINERVOTに任せてみましょう。SNS・ブログ・資料のいずれかから始めるのがおすすめです。",
      format: "回答",
    },
    employeeSteps: [
      { icon: "📝", role: "MINERVOT", status: "分析中" },
      { icon: "📝", role: "MINERVOT", status: "回答作成中" },
      ...BASE_EMPLOYEE_TAIL.slice(1),
    ],
    nextIntegration: { label: "追加依頼を開く", href: "/chat" },
    onboardingTaskId: "ai_chat",
  },
  {
    id: "files",
    icon: "📂",
    label: "ファイル整理",
    jobCategory: "file_organize",
    assignment: "Google Drive内の資料フォルダ整理プランを作成してください。",
    leadEmployee: "資料担当",
    saveLocation: "Google Drive（連携後）",
    deliverable: {
      title: "フォルダ整理プラン",
      preview:
        "・営業資料 / 提案書\n・ブログ下書き\n・社内共有\n不要ファイルはアーカイブフォルダへ移動する案です。",
      format: "整理案",
    },
    employeeSteps: [
      { icon: "📂", role: "資料担当", status: "分析中" },
      { icon: "📂", role: "資料担当", status: "整理案作成中" },
      ...BASE_EMPLOYEE_TAIL,
    ],
    nextIntegration: {
      label: "Google Driveを連携しましょう",
      href: "/settings/google/drive",
    },
    onboardingTaskId: "files",
  },
] as const;

const TASK_MAP = Object.fromEntries(
  FIRST_EXPERIENCE_TASKS.map((task) => [task.id, task]),
) as Record<Exclude<FirstExperienceTaskId, "custom">, FirstExperienceTaskDefinition>;

export function getFirstExperienceTask(
  taskId: FirstExperienceTaskId,
  customText?: string,
): FirstExperienceTaskDefinition {
  if (taskId === "custom") {
    const text = customText?.trim() || "業務の進め方について相談したいです";
    return {
      id: "custom",
      icon: "✨",
      label: "自由入力",
      jobCategory: "generic",
      assignment: text,
      leadEmployee: "MINERVOT",
      saveLocation: "MINERVOT",
      deliverable: {
        title: "成果物",
        preview: `${text}について、MINERVOTが対応方針をまとめました。ホームから本格的な仕事を続けられます。`,
        format: "テキスト",
      },
      employeeSteps: [
        { icon: "🤖", role: "MINERVOT", status: "分析中" },
        { icon: "🤖", role: "MINERVOT", status: "作成中" },
        ...BASE_EMPLOYEE_TAIL.slice(1),
      ],
      nextIntegration: { label: "連携設定を見る", href: "/settings" },
      onboardingTaskId: "company",
    };
  }
  return TASK_MAP[taskId];
}

export function getRecommendedFirstExperienceTaskId(
  preferredTasks: readonly string[],
): FirstExperienceTaskId {
  const priority: FirstExperienceTaskId[] = [
    "sns",
    "blog",
    "sales_material",
    "email",
    "ai_chat",
    "files",
  ];
  for (const id of priority) {
    if (preferredTasks.includes(id)) return id;
  }
  return "sns";
}

/** Progress bar fill levels (0–8). */
export const FIRST_EXPERIENCE_PROGRESS_STEPS = [0, 1, 2, 4, 5, 6, 7, 8] as const;

export const PROGRESS_STEP_DELAY_MS = 700;
export const EMPLOYEE_STEP_DELAY_MS = 900;
