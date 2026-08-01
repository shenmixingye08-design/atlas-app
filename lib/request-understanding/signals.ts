import type { DocumentKind, OutputFormat } from "./types";

export type FormatSignal = {
  format: OutputFormat;
  weight: number;
  reason: string;
  explicit: boolean;
};

export type KindSignal = {
  kind: Exclude<DocumentKind, null>;
  weight: number;
};

function includesAny(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

/** Explicit user format mentions — highest priority. */
export function detectExplicitFormats(assignment: string): FormatSignal[] {
  const text = assignment;
  const signals: FormatSignal[] = [];

  const rules: Array<{ format: OutputFormat; keys: string[]; reason: string }> = [
    {
      format: "xlsx",
      keys: ["excel", "エクセル", "xlsx", ".xlsx", "表計算"],
      reason: "Excel形式を明示",
    },
    {
      format: "csv",
      keys: ["csv", "シーエスブイ", ".csv"],
      reason: "CSV形式を明示",
    },
    {
      format: "docx",
      keys: ["word", "ワード", "docx", ".docx", "ワードファイル", "文書で", "文書を"],
      reason: "Word形式を明示",
    },
    {
      format: "pdf",
      keys: ["pdf", "ピーディーエフ", ".pdf", "提出用", "印刷用", "確定版"],
      reason: "PDF/提出用途を明示",
    },
    {
      format: "pptx",
      keys: ["powerpoint", "パワーポイント", "pptx", ".pptx", "スライド", "ppt"],
      reason: "PowerPoint形式を明示",
    },
    {
      format: "markdown",
      keys: ["markdown", "マークダウン", ".md"],
      reason: "Markdownを明示",
    },
    {
      format: "json",
      keys: ["json", ".json"],
      reason: "JSONを明示",
    },
  ];

  for (const rule of rules) {
    if (includesAny(text, rule.keys)) {
      // 「提出用」「印刷用」 alone → pdf but weaker than "PDFで"
      const strong = includesAny(text, [
        "pdf",
        "excel",
        "エクセル",
        "word",
        "ワード",
        "pptx",
        "powerpoint",
        "パワーポイント",
        "csv",
        "json",
        "markdown",
      ]);
      signals.push({
        format: rule.format,
        weight: strong ? 1.0 : 0.75,
        reason: rule.reason,
        explicit: strong || rule.format === "pdf",
      });
    }
  }

  // 「PDFでも」 → additional pdf
  if (/pdfでも|PDFも|提出用も|印刷も/.test(text) && !signals.some((s) => s.format === "pdf")) {
    signals.push({
      format: "pdf",
      weight: 0.95,
      reason: "追加でPDFも希望",
      explicit: true,
    });
  }

  return signals;
}

export function detectDocumentKind(assignment: string): KindSignal | null {
  const rules: Array<{ kind: Exclude<DocumentKind, null>; keys: string[]; weight: number }> = [
    { kind: "minutes", keys: ["議事録", "ミーティングメモ", "会議録"], weight: 0.95 },
    { kind: "estimate", keys: ["見積書", "お見積", "見積もり"], weight: 0.95 },
    { kind: "invoice", keys: ["請求書", "invoice"], weight: 0.95 },
    { kind: "contract", keys: ["契約書", "nda", "秘密保持", "利用規約"], weight: 0.92 },
    { kind: "household", keys: ["家計簿", "レシート", "領収書"], weight: 0.93 },
    { kind: "attendance", keys: ["勤務表", "勤怠", "シフト表"], weight: 0.92 },
    {
      kind: "sales_deck",
      keys: [
        "営業資料",
        "提案資料",
        "pitch deck",
        "sales deck",
        "プレゼン資料",
        "プレゼン",
        "スライド",
        "発表資料",
        "サービス紹介",
      ],
      weight: 0.93,
    },
    { kind: "proposal", keys: ["営業提案", "提案書", "企画書"], weight: 0.9 },
    { kind: "report", keys: ["報告書", "施工報告", "月次レポート", "レポート", "白書"], weight: 0.9 },
    { kind: "resume", keys: ["履歴書", "職務経歴"], weight: 0.92 },
    { kind: "blog", keys: ["ブログ", "コラム", "記事を"], weight: 0.88 },
    { kind: "email_draft", keys: ["メール文", "メールを作", "メール下書き", "メール文章"], weight: 0.9 },
    { kind: "sns_draft", keys: ["投稿文", "ツイート文", "キャプション", "文案"], weight: 0.9 },
    {
      kind: "generic",
      keys: [
        "売上表",
        "一覧表",
        "管理表",
        "集計表",
        "経費精算",
        "スケジュール表",
        "管理シート",
        "表にまと",
        "表形式",
      ],
      weight: 0.85,
    },
    { kind: "report", keys: ["マニュアル", "案内状", "お詫び文"], weight: 0.8 },
  ];

  for (const rule of rules) {
    if (includesAny(assignment, rule.keys)) {
      return { kind: rule.kind, weight: rule.weight };
    }
  }
  return null;
}

/** Implied formats from document kind when user did not specify. */
export function impliedFormatsForKind(
  kind: DocumentKind,
): Array<{ format: OutputFormat; purpose: string; weight: number }> {
  switch (kind) {
    case "minutes":
    case "contract":
    case "resume":
      return [
        { format: "docx", purpose: "編集用本文", weight: 0.9 },
        { format: "pdf", purpose: "提出・共有用", weight: 0.75 },
      ];
    case "blog":
      return [
        { format: "markdown", purpose: "記事本文", weight: 0.88 },
        { format: "docx", purpose: "編集用", weight: 0.7 },
      ];
    case "report":
      return [
        { format: "pdf", purpose: "提出用報告書", weight: 0.9 },
        { format: "docx", purpose: "編集用", weight: 0.7 },
      ];
    case "estimate":
    case "invoice":
    case "household":
    case "attendance":
      return [
        { format: "xlsx", purpose: "編集・集計用", weight: 0.92 },
        { format: "pdf", purpose: "提出用", weight: 0.8 },
      ];
    case "sales_deck":
      return [
        { format: "pptx", purpose: "説明用スライド", weight: 0.93 },
        { format: "pdf", purpose: "配布用", weight: 0.8 },
      ];
    case "proposal":
      return [
        { format: "docx", purpose: "提案本文", weight: 0.85 },
        { format: "pdf", purpose: "提出用", weight: 0.8 },
      ];
    case "email_draft":
    case "sns_draft":
      return [{ format: "markdown", purpose: "文面ドラフト", weight: 0.88 }];
    case "generic":
      return [{ format: "xlsx", purpose: "表データ", weight: 0.8 }];
    default:
      return [{ format: "markdown", purpose: "テキスト整理", weight: 0.55 }];
  }
}

export type ActionSignals = {
  wantsCreate: boolean;
  wantsConvert: boolean;
  wantsAnalyze: boolean;
  wantsEdit: boolean;
  wantsExternalSend: boolean;
  wantsDraftOnly: boolean;
  wantsAutomation: boolean;
  wantsScheduleOnce: boolean;
  convertTarget: OutputFormat | null;
  convertSourceHint: string | null;
};

export function detectActionSignals(assignment: string): ActionSignals {
  const text = assignment;
  const wantsConvert =
    /にして$|に変換|へ変換|をpdfに|をPDFに|をexcelに|をエクセルに|をwordに|をワードに|convert|そのままPDF|提出用に変換/i.test(
      text,
    ) ||
    /この(Excel|エクセル|PDF|Word|ワード|画像|表).*(に|へ).*(して|変換)/i.test(text) ||
    (/(Excel|エクセル|xlsx|Word|ワード|docx)/i.test(text) &&
      /PDFで提出|をPDF|PDFに/.test(text));

  let convertTarget: OutputFormat | null = null;
  if (/pdfに|PDFに|pdfへ|PDFへ/.test(text)) convertTarget = "pdf";
  else if (/excelに|エクセルに|xlsxに/.test(text)) convertTarget = "xlsx";
  else if (/wordに|ワードに|docxに/.test(text)) convertTarget = "docx";
  else if (/pptxに|スライドに|powerpointに/i.test(text)) convertTarget = "pptx";
  else if (/csvに/.test(text)) convertTarget = "csv";

  const convertSourceHint = /Excel|エクセル|xlsx/i.test(text)
    ? "xlsx"
    : /PDF|pdf/.test(text)
      ? "pdf"
      : /Word|ワード|docx/i.test(text)
        ? "docx"
        : /画像|写真|レシート|スクショ/.test(text)
          ? "image"
          : null;

  const wantsAnalyze =
    /要約|解析|分析|抽出|読み取|OCR|ocr|内容を教えて|何が書いて/.test(text);

  const wantsEdit =
    /編集して|直して|修正して|更新して|ページ.*削除|削除して|結合して|分割して|回転して|並べ替|入れ替/.test(
      text,
    );
  // External execute vs draft-only — critical distinction
  const postIntent =
    /へ投稿して|に投稿して|を投稿して|へ投稿|に投稿/.test(text) ||
    (/投稿して/.test(text) && !/投稿文/.test(text));
  const wantsExternalSend =
    (postIntent ||
      /メールを送って|メール送信|送信して|予定を登録|カレンダーに追加|公開して|アップロードして|Driveに保存|ドライブに保存|Slackに送|チャットに送|来週送って/.test(
        text,
      ) ||
      (/に送って|へ送って|を送って|送って/.test(text) &&
        !/案を|文を|下書き|文案/.test(text))) &&
    !/投稿文|メール文|下書き|文を作|文案|カレンダー案|ツイート文案/.test(text);  const wantsDraftOnly =
    /投稿文|メール文|文を作って|文案|下書き|キャプションを作|考えだけ|文面だけ/.test(text) ||
    (/投稿して/.test(text) === false && /投稿文/.test(text));

  const wantsAutomation =
    /毎日|毎週|毎月|定期的に|毎朝|毎晩|毎回|自動化|オートメーション/.test(text) &&
    !/今日だけ|一度だけ|1回だけ|今回だけ/.test(text);

  const wantsScheduleOnce = /一度だけ|今日だけ|今回だけ|来週送って|予約して/.test(text);

  const wantsCreate =
    /作って|作成|生成|まとめて|用意して|書いて|つくって/.test(text) ||
    (!wantsConvert && !wantsAnalyze && !wantsExternalSend && text.length > 0);

  return {
    wantsCreate,
    wantsConvert,
    wantsAnalyze,
    wantsEdit,
    wantsExternalSend,
    wantsDraftOnly,
    wantsAutomation,
    wantsScheduleOnce,
    convertTarget,
    convertSourceHint,
  };
}

export function normalizeTypos(assignment: string): string {
  return assignment
    .replace(/エクセルる/g, "エクセル")
    .replace(/わーど/g, "ワード")
    .replace(/ぱわぽ/gi, "パワーポイント")
    .replace(/みつもり/g, "見積")
    .replace(/せいきゅう/g, "請求")
    .replace(/ぎじろく/g, "議事録");
}

export function preferredFormatToOutput(
  preferred: string | null | undefined,
): OutputFormat | null {
  if (!preferred) return null;
  const n = preferred.trim().toLowerCase();
  if (n === "auto" || n === "") return null;
  if (n === "docx" || n === "word" || n === "doc") return "docx";
  if (n === "xlsx" || n === "excel" || n === "xls") return "xlsx";
  if (n === "pdf") return "pdf";
  if (n === "pptx" || n === "powerpoint" || n === "ppt") return "pptx";
  if (n === "csv") return "csv";
  if (n === "md" || n === "markdown") return "markdown";
  if (n === "json") return "json";
  if (n === "txt" || n === "text") return "markdown";
  return null;
}
