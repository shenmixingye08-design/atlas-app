export type LandingAiStatus = "active" | "idle";

export const HERO_MOCKUP = {
  greeting: "おかえりなさい。",
  headline: "ATLASが今日の仕事を準備しました。",
  todayJobs: [
    { id: "1", icon: "📱", title: "X投稿（18:00）", status: "未開始" as const },
    { id: "2", icon: "📝", title: "ブログ下書き", status: "準備中" as const },
    { id: "3", icon: "📊", title: "週次レポート", status: "確認待ち" as const },
  ],
  inProgress: [
    { id: "p1", icon: "📱", label: "SNS投稿を作成中", progress: 72 },
    { id: "p2", icon: "✉️", label: "メール返信を作成中", progress: 45 },
  ],
  completed: [
    { id: "c1", icon: "📝", title: "ブログ記事を公開" },
    { id: "c2", icon: "📁", title: "Driveへ資料保存" },
  ],
  aiEmployees: [
    { id: "sns", icon: "📱", role: "SNS担当", status: "active" as LandingAiStatus, tasks: 3 },
    { id: "blog", icon: "📝", role: "ブログ担当", status: "active" as LandingAiStatus, tasks: 1 },
    { id: "sales", icon: "📄", role: "資料担当", status: "idle" as LandingAiStatus, tasks: 0 },
    { id: "sec", icon: "📧", role: "秘書", status: "active" as LandingAiStatus, tasks: 2 },
  ],
  connections: [
    { id: "google", name: "Google", connected: true },
    { id: "x", name: "X", connected: true },
    { id: "wordpress", name: "WordPress", connected: true },
  ],
  chatPlaceholder: "例）営業資料を作る / 毎日18時にXへ投稿",
} as const;

export const LANDING_WORKFLOW_EXPERIENCE = [
  { id: "register", icon: "📋", label: "仕事登録" },
  { id: "analyze", icon: "🧠", label: "AI秘書が分析" },
  { id: "create", icon: "✨", label: "成果物作成" },
  { id: "wordpress", icon: "📝", label: "WordPress公開" },
  { id: "x", icon: "📱", label: "X投稿" },
  { id: "drive", icon: "📁", label: "Google Drive保存" },
  { id: "notify", icon: "🔔", label: "通知" },
  { id: "done", icon: "✅", label: "完了" },
] as const;

export const LANDING_AI_TEAM_CARDS = [
  {
    id: "sns",
    icon: "📱",
    role: "SNS担当",
    subtitle: "SNS投稿・予約投稿",
    status: "active" as LandingAiStatus,
    todayTasks: 5,
  },
  {
    id: "blog",
    icon: "📝",
    role: "ブログ担当",
    subtitle: "SEO記事作成",
    status: "active" as LandingAiStatus,
    todayTasks: 2,
  },
  {
    id: "sales",
    icon: "📄",
    role: "資料担当",
    subtitle: "PowerPoint・PDF作成",
    status: "idle" as LandingAiStatus,
    todayTasks: 0,
  },
  {
    id: "secretary",
    icon: "📧",
    role: "秘書",
    subtitle: "メール整理・返信下書き",
    status: "active" as LandingAiStatus,
    todayTasks: 4,
  },
] as const;

export const LANDING_DASHBOARD_STATS = [
  { id: "runs", label: "今日のAI実行数", value: "24", unit: "件", trend: "+12%" },
  { id: "deliverables", label: "今日の成果物", value: "8", unit: "件", trend: null },
  { id: "saved", label: "節約時間", value: "2.5", unit: "時間", trend: null },
  { id: "services", label: "接続サービス数", value: "3", unit: "件", trend: null },
  { id: "active-ai", label: "稼働中の担当", value: "3", unit: "件", trend: null },
  { id: "users", label: "利用ユーザー数", value: "1.2k", unit: "β", trend: "ベータ" },
] as const;

export const LANDING_CTA_TRUST = [
  "クレジットカード不要",
  "数分で開始",
  "Google連携対応",
] as const;
