/**
 * ホーム「送ってください。あとは私がやります。」用の
 * 軽量アップロード分類ロジック。
 *
 * 目的: 追加のAIコストを増やさず、MIME種別とファイル名のヒューリスティックだけで
 * 「何の資料か」「どの仕事に流すか」を推定し、既存の Commander パイプラインへ
 * assignment（依頼文）として引き渡す。判定はすべて通常プログラムで行い、
 * AIは後段の Commander（内容理解・実行）でのみ使う。
 */

export type UploadIntentId =
  | "receipt"
  | "contract"
  | "business_card"
  | "meeting"
  | "invoice"
  | "screenshot"
  | "site_photo"
  | "sns"
  | "document"
  | "generic";

export type UploadIntentConfidence = "high" | "low";

export type UploadIntent = {
  id: UploadIntentId;
  /** 例: 📸 */
  emoji: string;
  /** AI秘書の宣言。例: 「レシートですね。家計簿へ登録します。」 */
  statement: string;
  /** 選択肢として表示する短いラベル。例: 「レシート → 家計簿へ登録」 */
  optionLabel: string;
  /** Commander へ渡す依頼文を組み立てる。 */
  buildAssignment: (fileNames: string[]) => string;
};

export type UploadClassification = {
  intent: UploadIntent;
  confidence: UploadIntentConfidence;
  /** 低確度時に提示する2択（intent を含む上位候補）。 */
  alternatives: UploadIntent[];
};

function joinFileNames(fileNames: string[]): string {
  const names = fileNames.filter((name) => name.trim().length > 0);
  if (names.length === 0) return "添付ファイル";
  if (names.length === 1) return `「${names[0]}」`;
  return `「${names[0]}」ほか${names.length - 1}件`;
}

export const UPLOAD_INTENTS: Record<UploadIntentId, UploadIntent> = {
  receipt: {
    id: "receipt",
    emoji: "📸",
    statement: "レシートですね。家計簿へ登録します。",
    optionLabel: "レシート → 家計簿へ登録",
    buildAssignment: (files) =>
      `${joinFileNames(files)}はレシートです。日付・店名・金額・品目を読み取り、家計簿（支出）へ登録してください。`,
  },
  contract: {
    id: "contract",
    emoji: "📄",
    statement: "契約書ですね。要約と期限の抽出を行います。",
    optionLabel: "契約書 → 要約・期限抽出",
    buildAssignment: (files) =>
      `${joinFileNames(files)}は契約書です。内容を要約し、契約期間・更新日・支払期日などの重要な期限を抽出してまとめてください。`,
  },
  business_card: {
    id: "business_card",
    emoji: "💳",
    statement: "名刺ですね。連絡先へ登録します。",
    optionLabel: "名刺 → 連絡先へ登録",
    buildAssignment: (files) =>
      `${joinFileNames(files)}は名刺です。氏名・会社名・役職・電話番号・メールアドレスを読み取り、連絡先へ登録してください。`,
  },
  meeting: {
    id: "meeting",
    emoji: "📊",
    statement: "会議資料ですね。要約してPowerPointを作成します。",
    optionLabel: "会議資料 → 要約・PowerPoint作成",
    buildAssignment: (files) =>
      `${joinFileNames(files)}は会議資料です。要点を要約し、共有用のPowerPoint（スライド）を作成してください。`,
  },
  invoice: {
    id: "invoice",
    emoji: "🧾",
    statement: "請求書ですね。経費へ登録します。",
    optionLabel: "請求書 → 経費登録",
    buildAssignment: (files) =>
      `${joinFileNames(files)}は請求書です。請求元・金額・支払期日・品目を読み取り、経費として登録してください。`,
  },
  screenshot: {
    id: "screenshot",
    emoji: "📱",
    statement: "スクリーンショットですね。内容を解析して修正案を作成します。",
    optionLabel: "スクリーンショット → 内容を解析して修正案を作成",
    buildAssignment: (files) =>
      `${joinFileNames(files)}はスクリーンショットです。表示内容を解析し、問題点や改善点を洗い出して修正案を作成してください。`,
  },
  site_photo: {
    id: "site_photo",
    emoji: "🏞",
    statement: "現場写真ですね。報告書を作成します。",
    optionLabel: "現場写真 → 報告書作成",
    buildAssignment: (files) =>
      `${joinFileNames(files)}は現場写真です。写っている状況を整理し、報告書としてまとめてください。`,
  },
  sns: {
    id: "sns",
    emoji: "💬",
    statement: "SNS用の画像ですね。X投稿文を自動で作成します。",
    optionLabel: "SNS画像 → X投稿文を自動作成",
    buildAssignment: (files) =>
      `${joinFileNames(files)}はSNS投稿用の画像です。画像に合ったX（旧Twitter）の投稿文を自動で作成してください。`,
  },
  document: {
    id: "document",
    emoji: "📄",
    statement: "資料ですね。内容を要約して整理します。",
    optionLabel: "資料 → 要約・整理",
    buildAssignment: (files) =>
      `${joinFileNames(files)}の内容を読み取り、要点を要約して分かりやすく整理してください。`,
  },
  generic: {
    id: "generic",
    emoji: "📎",
    statement: "資料を受け取りました。内容を理解して最適な仕事を進めます。",
    optionLabel: "内容を解析して最適な作業を進める",
    buildAssignment: (files) =>
      `${joinFileNames(files)}を受け取りました。内容を理解し、最も適切な仕事を最後まで進めてください。`,
  },
};

type KeywordRule = {
  id: UploadIntentId;
  keywords: string[];
};

/** ファイル名（小文字化・日本語含む）に対するキーワード規則。上から順に評価。 */
const KEYWORD_RULES: KeywordRule[] = [
  { id: "receipt", keywords: ["レシート", "領収", "receipt"] },
  { id: "invoice", keywords: ["請求", "invoice", "bill", "seikyu"] },
  { id: "contract", keywords: ["契約", "contract", "keiyaku", "覚書", "nda"] },
  {
    id: "business_card",
    keywords: ["名刺", "meishi", "business_card", "businesscard", "namecard"],
  },
  {
    id: "meeting",
    keywords: ["会議", "議事", "meeting", "minutes", "agenda", "打ち合わせ"],
  },
  { id: "site_photo", keywords: ["現場", "genba", "site", "工事", "施工"] },
  {
    id: "sns",
    keywords: ["sns", "insta", "instagram", "twitter", "post", "投稿"],
  },
  {
    id: "screenshot",
    keywords: [
      "スクショ",
      "スクリーンショット",
      "screenshot",
      "screen shot",
      "screen_shot",
      "capture",
      "画面",
    ],
  },
];

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchByFileName(fileName: string): UploadIntentId | null {
  const normalized = normalizeName(fileName);
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return rule.id;
    }
  }
  // iOS/Android の既定名は「スクリーンショット」であることが多い。
  if (/^(img[_-]?\d+|photo[_-]?\d+)/i.test(normalized)) return null;
  return null;
}

type ClassifyInput = {
  fileName: string;
  mimeType: string | null;
};

/**
 * 単一ファイルからアップロード意図を推定する。
 * - ファイル名キーワードが一致 → 高確度
 * - 一致しない画像/PDF → 低確度（2択を提示）
 */
export function classifyUpload(input: ClassifyInput): UploadClassification {
  const mime = (input.mimeType ?? "").toLowerCase();
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(input.fileName);
  const matchedId = matchByFileName(input.fileName);

  if (matchedId) {
    return {
      intent: UPLOAD_INTENTS[matchedId],
      confidence: "high",
      alternatives: [UPLOAD_INTENTS[matchedId]],
    };
  }

  // キーワード不一致。種別から2択を提示（低確度）。
  if (isPdf) {
    return {
      intent: UPLOAD_INTENTS.document,
      confidence: "low",
      alternatives: [UPLOAD_INTENTS.contract, UPLOAD_INTENTS.document],
    };
  }

  if (isImage) {
    return {
      intent: UPLOAD_INTENTS.generic,
      confidence: "low",
      alternatives: [UPLOAD_INTENTS.receipt, UPLOAD_INTENTS.generic],
    };
  }

  return {
    intent: UPLOAD_INTENTS.document,
    confidence: "low",
    alternatives: [UPLOAD_INTENTS.document, UPLOAD_INTENTS.generic],
  };
}

/** 複数ファイルの先頭を代表として分類する。 */
export function classifyUploads(
  files: Array<{ name: string; type: string | null }>,
): UploadClassification | null {
  const first = files[0];
  if (!first) return null;
  return classifyUpload({ fileName: first.name, mimeType: first.type });
}
