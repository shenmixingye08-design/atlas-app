/**
 * Phase5 §3 — 競合比較。未確認は断定しない。
 */

export type CompCell = "勝" | "同等" | "負" | "未確認" | "N/A";

export type CompetitiveRow = {
  dimension: string;
  minervot: CompCell;
  chatgpt: CompCell;
  claude: CompCell;
  gemini: CompCell;
  copilot: CompCell;
  notionAi: CompCell;
  manus: CompCell;
  genspark: CompCell;
  note: string;
};

export const COMPETITIVE_MATRIX: readonly CompetitiveRow[] = [
  {
    dimension: "日本語での依頼しやすさ",
    minervot: "同等",
    chatgpt: "同等",
    claude: "同等",
    gemini: "同等",
    copilot: "同等",
    notionAi: "同等",
    manus: "未確認",
    genspark: "未確認",
    note: "日本語UIはMINERVOTの強みだがモデル性能は未比較測定",
  },
  {
    dimension: "画像解析",
    minervot: "同等",
    chatgpt: "同等",
    claude: "同等",
    gemini: "同等",
    copilot: "未確認",
    notionAi: "未確認",
    manus: "未確認",
    genspark: "未確認",
    note: "MINERVOTはOpenAI Vision依存。専用OCR製品ではない",
  },
  {
    dimension: "Word実ファイル生成",
    minervot: "勝",
    chatgpt: "負",
    claude: "負",
    gemini: "負",
    copilot: "同等",
    notionAi: "負",
    manus: "未確認",
    genspark: "未確認",
    note: "チャット系は主にテキスト。CopilotはOffice文脈で強い可能性（未測定）",
  },
  {
    dimension: "Excel実ファイル生成",
    minervot: "勝",
    chatgpt: "負",
    claude: "負",
    gemini: "負",
    copilot: "同等",
    notionAi: "負",
    manus: "未確認",
    genspark: "未確認",
    note: "同上",
  },
  {
    dimension: "PDF / PowerPoint",
    minervot: "勝",
    chatgpt: "負",
    claude: "負",
    gemini: "負",
    copilot: "同等",
    notionAi: "負",
    manus: "未確認",
    genspark: "未確認",
    note: "品質比較は未測定。生成の有無で評価",
  },
  {
    dimension: "成果物品質",
    minervot: "未確認",
    chatgpt: "未確認",
    claude: "未確認",
    gemini: "未確認",
    copilot: "未確認",
    notionAi: "未確認",
    manus: "未確認",
    genspark: "未確認",
    note: "ブラインド評価未実施。過大評価禁止",
  },
  {
    dimension: "ファイル編集 / 変換",
    minervot: "同等",
    chatgpt: "負",
    claude: "負",
    gemini: "負",
    copilot: "勝",
    notionAi: "未確認",
    manus: "未確認",
    genspark: "未確認",
    note: "MINERVOT変換はlossy。Office編集はCopilot有利の可能性",
  },
  {
    dimension: "外部サービス実行",
    minervot: "同等",
    chatgpt: "負",
    claude: "負",
    gemini: "未確認",
    copilot: "同等",
    notionAi: "未確認",
    manus: "未確認",
    genspark: "未確認",
    note: "実装はあるが本番未検証。Zapier系自動化サービスとは別軸",
  },
  {
    dimension: "繰り返し自動化",
    minervot: "勝",
    chatgpt: "負",
    claude: "負",
    gemini: "負",
    copilot: "未確認",
    notionAi: "未確認",
    manus: "未確認",
    genspark: "未確認",
    note: "対チャットAI。対専用自動化SaaSでは未確認/負けうる",
  },
  {
    dimension: "通知・履歴・再編集",
    minervot: "勝",
    chatgpt: "負",
    claude: "負",
    gemini: "負",
    copilot: "未確認",
    notionAi: "同等",
    manus: "未確認",
    genspark: "未確認",
    note: "成果物ID単位の履歴が差別化候補",
  },
  {
    dimension: "スマホ利用",
    minervot: "同等",
    chatgpt: "勝",
    claude: "勝",
    gemini: "勝",
    copilot: "同等",
    notionAi: "同等",
    manus: "未確認",
    genspark: "未確認",
    note: "MINERVOTはレスポンシブWeb。専用アプリなし",
  },
  {
    dimension: "料金（Light相当）",
    minervot: "同等",
    chatgpt: "未確認",
    claude: "未確認",
    gemini: "未確認",
    copilot: "未確認",
    notionAi: "未確認",
    manus: "未確認",
    genspark: "未確認",
    note: "¥980/月。競合の最新価格は変動するため未確認",
  },
  {
    dimension: "完了までの手間（実ファイル）",
    minervot: "勝",
    chatgpt: "負",
    claude: "負",
    gemini: "負",
    copilot: "同等",
    notionAi: "負",
    manus: "未確認",
    genspark: "未確認",
    note: "前提: 生成パイプラインが成功した場合",
  },
] as const;

export const MINERVOT_WINS = [
  "短い日本語依頼から実ファイル（docx/xlsx/pdf/pptx）までの導線",
  "成果物履歴・再編集・定期実行を同一プロダクトに持つ点（チャット単体比）",
  "日本向けUI文言と業務サンプル導線",
] as const;

export const MINERVOT_LOSSES = [
  "本番E2E・外部連携の公開検証が未完了（信頼性で負ける）",
  "モデル単体の文章/推論品質は大手LLMに対し未測定（おそらく同等〜劣位）",
  "ネイティブアプリ・ブランド認知・プラグイン生態系で負ける",
  "Microsoft CopilotはOffice編集文脈で強い可能性",
  "専用OCR/家計簿/CRM代替ではない",
  "Email通知未実装",
] as const;
