import type { BetaFlowId, BetaPersona } from "./types";

/** 説明なしテストで伝える文面（これ以外は原則説明しない）。 */
export const NO_INSTRUCTION_BRIEF =
  "MINERVOTを使って、指定された仕事を完了してください。";

export const BETA_FLOWS: readonly {
  id: BetaFlowId;
  title: string;
  taskForUser: string;
  required: boolean;
}[] = [
  {
    id: "A_word",
    title: "短い依頼からWord作成",
    taskForUser: "会議の議事録を作って",
    required: true,
  },
  {
    id: "B_excel",
    title: "表形式の依頼からExcel作成",
    taskForUser: "売上管理表を作って",
    required: true,
  },
  {
    id: "C_image_excel",
    title: "画像から成果物作成",
    taskForUser:
      "レシート画像を添付し、日付・店名・金額をExcelに整理して（家計簿アプリ追記は不要）",
    required: true,
  },
  {
    id: "D_revise",
    title: "既存成果物の再編集",
    taskForUser: "このExcelに合計列を追加して",
    required: true,
  },
  {
    id: "E_convert_pdf",
    title: "成果物変換 Word→PDF",
    taskForUser: "作ったWordをPDFにして",
    required: true,
  },
  {
    id: "F_pptx",
    title: "PowerPoint作成",
    taskForUser: "営業説明資料をPowerPointで作って",
    required: false,
  },
  {
    id: "G_notification",
    title: "通知から成果物詳細へ",
    taskForUser: "完了通知から成果物を開いてください",
    required: false,
  },
  {
    id: "H_external",
    title: "外部連携",
    taskForUser: "可能な範囲で連携設定を試してください（失敗も記録）",
    required: false,
  },
  {
    id: "I_automation",
    title: "繰り返し自動化",
    taskForUser: "定期の仕事を1件作ってください",
    required: false,
  },
] as const;

export const TARGET_PERSONA_MIX: readonly {
  persona: BetaPersona;
  minCount: number;
}[] = [
  { persona: "ai_beginner", minCount: 2 },
  { persona: "office_admin", minCount: 2 },
  { persona: "sales", minCount: 1 },
  { persona: "mobile_primary", minCount: 2 },
  { persona: "pc_primary", minCount: 2 },
  { persona: "file_novice", minCount: 1 },
  { persona: "office_daily", minCount: 1 },
  { persona: "wants_integrations", minCount: 1 },
];

export const INTERVIEW_QUESTIONS = [
  "最初に何のサービスだと思ったか",
  "何を頼めると思ったか",
  "一番迷った場所",
  "一番便利だと思った機能",
  "一番不安だった点",
  "結果は期待どおりだったか",
  "月額980円を払う価値があるか",
  "どんな仕事なら毎月使うか",
  "ChatGPTではなくMINERVOTを使う理由があるか",
  "もう一度使いたいか",
] as const;
