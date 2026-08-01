/**
 * Phase5 §1–§5 — 仕事定義・主要ユースケース・ChatGPT比較・差別化核。
 * 未実装を主力にしない。
 */

export type UseCaseScore = {
  id: string;
  title: string;
  audience: string;
  frequency: string;
  painMinutes: number;
  saveMinutesEstimate: number;
  techMaturity: "high" | "medium" | "low";
  productionSuccess: "unverified" | "partial" | "fail";
  vsChatgpt: string;
  worth980: boolean;
  retention: boolean;
  demoFriendly: boolean;
  keptAsCore: boolean;
  reasonIfDropped?: string;
};

/** 候補を評価し、主力のみ keptAsCore=true（最大10、実際は価値のあるものだけ）。 */
export const USE_CASES: readonly UseCaseScore[] = [
  {
    id: "uc_sales_excel",
    title: "短い依頼から売上/管理表Excelを完成・ダウンロード",
    audience: "事務・個人事業主・営業事務",
    frequency: "週〜月",
    painMinutes: 25,
    saveMinutesEstimate: 15,
    techMaturity: "high",
    productionSuccess: "unverified",
    vsChatgpt:
      "ChatGPTは表のテキストは出せるが、実.xlsxの生成・保存・再編集まで一気通貫ではない",
    worth980: true,
    retention: true,
    demoFriendly: true,
    keptAsCore: true,
  },
  {
    id: "uc_pitch_pptx",
    title: "営業説明をPowerPointで作成・ダウンロード",
    audience: "営業職・小規模事業者",
    frequency: "週",
    painMinutes: 60,
    saveMinutesEstimate: 35,
    techMaturity: "high",
    productionSuccess: "unverified",
    vsChatgpt: "構成案は競合でも可。実.pptx＋版管理が差分",
    worth980: true,
    retention: true,
    demoFriendly: true,
    keptAsCore: true,
  },
  {
    id: "uc_minutes_docx",
    title: "議事録をWordで整理・ダウンロード",
    audience: "事務・現場管理者",
    frequency: "週",
    painMinutes: 30,
    saveMinutesEstimate: 18,
    techMaturity: "high",
    productionSuccess: "unverified",
    vsChatgpt: "文章は競合でも可。docx成果物＋履歴再利用が差分",
    worth980: true,
    retention: true,
    demoFriendly: true,
    keptAsCore: true,
  },
  {
    id: "uc_receipt_excel",
    title: "レシート写真→支出一覧Excel（家計簿モジュールは含まない）",
    audience: "個人事業主・一般ユーザー",
    frequency: "週",
    painMinutes: 20,
    saveMinutesEstimate: 12,
    techMaturity: "medium",
    productionSuccess: "unverified",
    vsChatgpt: "ChatGPTでも読取は可だが、添付→構造化xlsx→DLの導線が長い",
    worth980: true,
    retention: true,
    demoFriendly: true,
    keptAsCore: true,
  },
  {
    id: "uc_report_pdf",
    title: "報告書をWord→PDF変換して提出用に揃える",
    audience: "現場管理者・事務",
    frequency: "週〜月",
    painMinutes: 40,
    saveMinutesEstimate: 20,
    techMaturity: "medium",
    productionSuccess: "unverified",
    vsChatgpt: "変換まで含めると手作業が残る",
    worth980: true,
    retention: true,
    demoFriendly: true,
    keptAsCore: true,
  },
  {
    id: "uc_history_revise",
    title: "過去成果物の再編集・版管理から再提出",
    audience: "全ターゲット",
    frequency: "継続",
    painMinutes: 15,
    saveMinutesEstimate: 10,
    techMaturity: "medium",
    productionSuccess: "unverified",
    vsChatgpt: "チャット履歴と異なり成果物ID単位で追跡",
    worth980: true,
    retention: true,
    demoFriendly: false,
    keptAsCore: true,
  },
  {
    id: "uc_schedule_notify",
    title: "定期の仕事（自動化）＋完了通知",
    audience: "SNS運用・事務・個人事業主",
    frequency: "毎日〜毎週",
    painMinutes: 15,
    saveMinutesEstimate: 10,
    techMaturity: "medium",
    productionSuccess: "unverified",
    vsChatgpt: "ChatGPT単体にスケジュール実行・通知ハブはない",
    worth980: true,
    retention: true,
    demoFriendly: false,
    keptAsCore: true,
  },
  {
    id: "uc_x_draft",
    title: "X投稿文の作成（Lightは下書き補助。自動投稿はStandard+）",
    audience: "SNS運用担当",
    frequency: "毎日",
    painMinutes: 20,
    saveMinutesEstimate: 8,
    techMaturity: "medium",
    productionSuccess: "unverified",
    vsChatgpt: "文案は競合同等。実投稿連携が差分（980円プランでは限定）",
    worth980: false,
    retention: true,
    demoFriendly: false,
    keptAsCore: false,
    reasonIfDropped:
      "Light(980)では自動投稿不可。文案だけならChatGPTで代替しやすい",
  },
  {
    id: "uc_wp_post",
    title: "ブログ→WordPress投稿",
    audience: "小規模事業者",
    frequency: "週",
    painMinutes: 45,
    saveMinutesEstimate: 25,
    techMaturity: "medium",
    productionSuccess: "unverified",
    vsChatgpt: "実投稿まで行くなら差分だがStandard+が必要",
    worth980: false,
    retention: true,
    demoFriendly: false,
    keptAsCore: false,
    reasonIfDropped: "980円プラン外（blog_creationはStandard+）",
  },
  {
    id: "uc_dropbox",
    title: "成果物をDropboxへ保存",
    audience: "事務・現場",
    frequency: "週",
    painMinutes: 10,
    saveMinutesEstimate: 5,
    techMaturity: "medium",
    productionSuccess: "unverified",
    vsChatgpt: "外部保存は差分だが本番未検証・feature flag",
    worth980: false,
    retention: true,
    demoFriendly: false,
    keptAsCore: false,
    reasonIfDropped: "本番未検証のため主力にしない",
  },
] as const;

export const CORE_USE_CASES = USE_CASES.filter((u) => u.keptAsCore);

/** 誰の・どの仕事を・どこまで代行するか（抽象「AI秘書」禁止）。 */
export const JOB_DEFINITION = {
  primaryUsers: [
    "中小企業の事務・営業事務",
    "個人事業主",
    "営業職（提案資料）",
    "現場管理者（報告書）",
    "AIに詳しくない一般ユーザー（短い日本語で依頼）",
  ],
  notPrimaryYet: [
    "SNS完全自動運用（Lightでは不可）",
    "Gmail/Calendar中心の秘書（Standard+）",
    "永続家計簿アプリ代替（モジュール未実装）",
  ],
  jobExamples: [
    {
      name: "売上表作成",
      stepsHuman: ["要件整理", "Excel作成", "体裁", "保存", "共有"],
      atlasCovers: ["要件理解", "xlsx生成", "ダウンロード", "履歴"],
      humanMustCheck: ["数字の正しさ", "社内フォーマット差分"],
      clicksTarget: 3,
      minutesTarget: 5,
    },
    {
      name: "レシート整理",
      stepsHuman: ["撮影", "手入力", "表作成", "合計"],
      atlasCovers: ["画像読取", "Excel化", "DL"],
      humanMustCheck: ["読取誤りの確認", "勘定科目"],
      clicksTarget: 4,
      minutesTarget: 4,
    },
  ],
} as const;

export const DIFFERENTIATION_CORES = [
  {
    id: "diff_real_files",
    title: "短い日本語だけで Word / Excel / PDF / PowerPoint の実ファイルまで完成",
    implemented: true,
    productionProven: false,
    worth980: true,
    caveat: "本番E2E未検証。ローカル生成パイプラインは実証済み",
  },
  {
    id: "diff_image_to_sheet",
    title: "画像（レシート等）から構造化Excel/報告書への一気通貫",
    implemented: true,
    productionProven: false,
    worth980: true,
    caveat: "家計簿への自動追記モジュールは未実装。Excel整理までが範囲",
  },
  {
    id: "diff_history_habit",
    title: "成果物履歴・再編集・定期の仕事で「一度きりチャット」にしない",
    implemented: true,
    productionProven: false,
    worth980: true,
    caveat: "通知はEmail未実装。Pushは設定依存",
  },
] as const;

export const CHATGPT_TEST_ANSWERS = CORE_USE_CASES.map((u) => ({
  useCaseId: u.id,
  chatgptAlone: u.id.startsWith("uc_minutes") || u.id === "uc_pitch_pptx",
  chatgptPlusManual: true,
  stepsSaved: u.id === "uc_history_revise" ? 2 : 3,
  onlyMinervot:
    u.id === "uc_schedule_notify"
      ? "スケジュール実行とジョブ/通知ハブ"
      : "実ファイル成果物の保存・版・再実行導線",
  minutesSaved: u.saveMinutesEstimate,
  returnReason: u.retention
    ? "同じ仕事の再実行・版管理・定期化"
    : "弱い",
  qualifiesAsCore:
    u.keptAsCore &&
    u.saveMinutesEstimate >= 10 &&
    u.worth980,
}));
