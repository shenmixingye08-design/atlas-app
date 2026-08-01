import type { ExecutionMode, OutputFormat } from "./types";

export type EvaluationCase = {
  id: string;
  category:
    | "word"
    | "excel"
    | "pdf"
    | "pptx"
    | "convert"
    | "external"
    | "automation"
    | "ambiguous";
  assignment: string;
  attachments?: Array<{ fileName: string; mimeType: string }>;
  expectIntent?: string[];
  expectMode: ExecutionMode[];
  expectFormats?: OutputFormat[];
  expectFormatAnyOf?: OutputFormat[][];
  expectMissing?: boolean;
  expectNoExternal?: boolean;
  expectExternal?: boolean;
  expectClarify?: boolean;
  allowUnnecessaryClarify?: boolean;
};

/** Production-like evaluation set (≥100). */
export const EVALUATION_CASES: EvaluationCase[] = [
  // Word 15
  { id: "w01", category: "word", assignment: "議事録を作って", expectMode: ["artifact"], expectFormats: ["docx"] },
  { id: "w02", category: "word", assignment: "会議の議事録をWordでまとめて", expectMode: ["artifact"], expectFormats: ["docx"] },
  { id: "w03", category: "word", assignment: "契約書のドラフトを作って", expectMode: ["artifact"], expectFormats: ["docx"] },
  { id: "w04", category: "word", assignment: "利用規約を文書で作成", expectMode: ["artifact"], expectFormats: ["docx"] },
  { id: "w05", category: "word", assignment: "企画書を書いて", expectMode: ["artifact"], expectFormatAnyOf: [["docx"], ["docx", "pdf"]] },
  { id: "w06", category: "word", assignment: "提案書をWordで", expectMode: ["artifact"], expectFormats: ["docx"] },
  { id: "w07", category: "word", assignment: "マニュアルを作成して", expectMode: ["artifact"], expectFormatAnyOf: [["docx"], ["pdf"], ["docx", "pdf"], ["markdown", "pdf"]] },
  { id: "w08", category: "word", assignment: "履歴書を作って", expectMode: ["artifact"], expectFormats: ["docx"], expectClarify: true },
  { id: "w09", category: "word", assignment: "職務経歴書をまとめて", expectMode: ["artifact"], expectFormats: ["docx"], expectClarify: true },
  { id: "w10", category: "word", assignment: "報告書をワードで作って", expectMode: ["artifact"], expectFormats: ["docx"] },
  { id: "w11", category: "word", assignment: "案内状を作成", expectMode: ["artifact"], expectFormatAnyOf: [["docx"], ["docx", "pdf"], ["markdown", "pdf"]] },
  { id: "w12", category: "word", assignment: "お詫び文を文書で", expectMode: ["artifact"], expectFormats: ["docx"] },
  { id: "w13", category: "word", assignment: "ブログ記事を書いて", expectMode: ["artifact"], expectFormatAnyOf: [["markdown"], ["docx"]] },
  { id: "w14", category: "word", assignment: "NDAのたたき台を作って", expectMode: ["artifact"], expectFormats: ["docx"] },
  { id: "w15", category: "word", assignment: "仕様書をWordで出力", expectMode: ["artifact"], expectFormats: ["docx"] },

  // Excel 15
  { id: "e01", category: "excel", assignment: "売上表を作って", expectMode: ["artifact"], expectFormats: ["xlsx"] },
  { id: "e02", category: "excel", assignment: "家計簿をエクセルで", expectMode: ["artifact"], expectFormats: ["xlsx"] },
  { id: "e03", category: "excel", assignment: "勤務表を作って", expectMode: ["artifact"], expectFormats: ["xlsx"], expectMissing: true },
  { id: "e04", category: "excel", assignment: "在庫管理表をお願い", expectMode: ["artifact"], expectFormats: ["xlsx"] },
  { id: "e05", category: "excel", assignment: "顧客一覧をExcelで", expectMode: ["artifact"], expectFormats: ["xlsx"] },
  { id: "e06", category: "excel", assignment: "見積書を作って", expectMode: ["artifact"], expectFormats: ["xlsx"], expectMissing: true },
  { id: "e07", category: "excel", assignment: "請求書の明細表を作って", expectMode: ["artifact"], expectFormats: ["xlsx"] },
  { id: "e08", category: "excel", assignment: "経費精算表を作成", expectMode: ["artifact"], expectFormats: ["xlsx"] },
  { id: "e09", category: "excel", assignment: "工程表をエクセルで", expectMode: ["artifact"], expectFormats: ["xlsx"] },
  { id: "e10", category: "excel", assignment: "スケジュール表を作って", expectMode: ["artifact"], expectFormats: ["xlsx"] },
  { id: "e11", category: "excel", assignment: "月次の集計表がほしい", expectMode: ["artifact"], expectFormats: ["xlsx"] },
  { id: "e12", category: "excel", assignment: "CSVで顧客データを出して", expectMode: ["artifact"], expectFormats: ["csv"] },
  { id: "e13", category: "excel", assignment: "売上管理シートを作って", expectMode: ["artifact"], expectFormats: ["xlsx"] },
  { id: "e14", category: "excel", assignment: "表にまとめて", expectMode: ["artifact"], expectFormats: ["xlsx"] },
  { id: "e15", category: "excel", assignment: "勤怠をエクセルで管理したい", expectMode: ["artifact"], expectFormats: ["xlsx"] },

  // PDF 15
  { id: "p01", category: "pdf", assignment: "提出用報告書を作って", expectMode: ["artifact"], expectFormats: ["pdf"] },
  { id: "p02", category: "pdf", assignment: "印刷用の案内をPDFで", expectMode: ["artifact"], expectFormats: ["pdf"] },
  { id: "p03", category: "pdf", assignment: "確定版の契約書をPDFで", expectMode: ["artifact"], expectFormats: ["pdf"] },
  { id: "p04", category: "pdf", assignment: "月次レポートをPDFで提出したい", expectMode: ["artifact"], expectFormats: ["pdf"] },
  { id: "p05", category: "pdf", assignment: "写真付き報告書をPDFで", expectMode: ["artifact"], expectFormats: ["pdf"] },
  { id: "p06", category: "pdf", assignment: "チラシをPDFで作って", expectMode: ["artifact"], expectFormats: ["pdf"] },
  { id: "p07", category: "pdf", assignment: "見積書を作ってPDFでもほしい", expectMode: ["artifact"], expectFormats: ["pdf"] },
  { id: "p08", category: "pdf", assignment: "報告書をpdfで", expectMode: ["artifact"], expectFormats: ["pdf"] },
  { id: "p09", category: "pdf", assignment: "白書をまとめてPDFに", expectMode: ["artifact"], expectFormats: ["pdf"] },
  { id: "p10", category: "pdf", assignment: "施工報告書を提出用で", expectMode: ["artifact"], expectFormats: ["pdf"] },
  { id: "p11", category: "pdf", assignment: "共有用にPDFがほしい。議事録", expectMode: ["artifact"], expectFormats: ["pdf"] },
  { id: "p12", category: "pdf", assignment: "請求書をPDFで発行", expectMode: ["artifact"], expectFormats: ["pdf"] },
  { id: "p13", category: "pdf", assignment: "提案書の確定版PDF", expectMode: ["artifact"], expectFormats: ["pdf"] },
  { id: "p14", category: "pdf", assignment: "マニュアルをPDF出力", expectMode: ["artifact"], expectFormats: ["pdf"] },
  { id: "p15", category: "pdf", assignment: "A4の提出資料をPDFで", expectMode: ["artifact"], expectFormats: ["pdf"] },

  // PowerPoint 15
  { id: "s01", category: "pptx", assignment: "営業資料を作って", expectMode: ["artifact"], expectFormats: ["pptx"] },
  { id: "s02", category: "pptx", assignment: "プレゼン資料をお願い", expectMode: ["artifact"], expectFormats: ["pptx"] },
  { id: "s03", category: "pptx", assignment: "提案資料をスライドで", expectMode: ["artifact"], expectFormats: ["pptx"] },
  { id: "s04", category: "pptx", assignment: "pitch deckを作って", expectMode: ["artifact"], expectFormats: ["pptx"] },
  { id: "s05", category: "pptx", assignment: "研修用スライドを作成", expectMode: ["artifact"], expectFormats: ["pptx"] },
  { id: "s06", category: "pptx", assignment: "会議用のPowerPoint", expectMode: ["artifact"], expectFormats: ["pptx"] },
  { id: "s07", category: "pptx", assignment: "営業説明のpptxがほしい", expectMode: ["artifact"], expectFormats: ["pptx"] },
  { id: "s08", category: "pptx", assignment: "発表資料をパワーポイントで", expectMode: ["artifact"], expectFormats: ["pptx"] },
  { id: "s09", category: "pptx", assignment: "会社紹介スライドを作って", expectMode: ["artifact"], expectFormats: ["pptx"] },
  { id: "s10", category: "pptx", assignment: "サービス紹介のプレゼン", expectMode: ["artifact"], expectFormats: ["pptx"] },
  { id: "s11", category: "pptx", assignment: "営業資料を作ってPDFも", expectMode: ["artifact"], expectFormats: ["pptx", "pdf"] },
  { id: "s12", category: "pptx", assignment: "スライド10枚で提案資料", expectMode: ["artifact"], expectFormats: ["pptx"] },
  { id: "s13", category: "pptx", assignment: "sales deck please", expectMode: ["artifact"], expectFormats: ["pptx"] },
  { id: "s14", category: "pptx", assignment: "社内発表用スライド", expectMode: ["artifact"], expectFormats: ["pptx"] },
  { id: "s15", category: "pptx", assignment: "新商品の提案資料", expectMode: ["artifact"], expectFormats: ["pptx"] },

  // Convert / vision 15
  { id: "c01", category: "convert", assignment: "このExcelをPDFにして", attachments: [{ fileName: "a.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }], expectMode: ["conversion"], expectFormats: ["pdf"] },
  { id: "c02", category: "convert", assignment: "このWordをPDFに変換", attachments: [{ fileName: "a.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }], expectMode: ["conversion"], expectFormats: ["pdf"] },
  { id: "c03", category: "convert", assignment: "このPDFを要約して", attachments: [{ fileName: "a.pdf", mimeType: "application/pdf" }], expectMode: ["analysis"] },
  { id: "c04", category: "convert", assignment: "この画像をExcelにして", attachments: [{ fileName: "t.png", mimeType: "image/png" }], expectMode: ["artifact", "mixed", "conversion"], expectFormats: ["xlsx"] },
  { id: "c05", category: "convert", assignment: "レシートから家計簿", attachments: [{ fileName: "r.jpg", mimeType: "image/jpeg" }], expectMode: ["artifact", "mixed"], expectFormats: ["xlsx"] },
  { id: "c06", category: "convert", assignment: "これをPDFにして", expectMode: ["conversion", "answer"], expectClarify: true },
  { id: "c07", category: "convert", assignment: "添付の表をCSVに", attachments: [{ fileName: "t.png", mimeType: "image/png" }], expectMode: ["artifact", "mixed", "conversion"], expectFormats: ["csv"] },
  { id: "c08", category: "convert", assignment: "PDFの内容を抽出して", attachments: [{ fileName: "a.pdf", mimeType: "application/pdf" }], expectMode: ["analysis"] },
  { id: "c09", category: "convert", assignment: "この請求書画像を経費登録して", attachments: [{ fileName: "inv.png", mimeType: "image/png" }], expectMode: ["artifact", "mixed", "analysis"] },
  { id: "c10", category: "convert", assignment: "スキャンした契約書を要約", attachments: [{ fileName: "c.pdf", mimeType: "application/pdf" }], expectMode: ["analysis"] },
  { id: "c11", category: "convert", assignment: "複数画像をPDFにまとめて", attachments: [{ fileName: "1.jpg", mimeType: "image/jpeg" }, { fileName: "2.jpg", mimeType: "image/jpeg" }], expectMode: ["artifact", "conversion", "mixed"], expectFormats: ["pdf"] },
  { id: "c12", category: "convert", assignment: "ExcelをそのままPDFで提出用に", attachments: [{ fileName: "s.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }], expectMode: ["conversion"], expectFormats: ["pdf"] },
  { id: "c13", category: "convert", assignment: "この資料を解析してポイント抽出", attachments: [{ fileName: "d.pdf", mimeType: "application/pdf" }], expectMode: ["analysis"] },
  { id: "c14", category: "convert", assignment: "名刺を読み取って", attachments: [{ fileName: "card.jpg", mimeType: "image/jpeg" }], expectMode: ["analysis", "artifact", "mixed"] },
  { id: "c15", category: "convert", assignment: "これExcel", attachments: [{ fileName: "shot.png", mimeType: "image/png" }], expectMode: ["artifact", "mixed", "conversion"], expectFormats: ["xlsx"] },

  // External 10
  { id: "x01", category: "external", assignment: "Xへ投稿して", expectMode: ["external_action", "mixed"], expectExternal: true },
  { id: "x02", category: "external", assignment: "お客様へメールを送って", expectMode: ["external_action", "mixed"], expectExternal: true },
  { id: "x03", category: "external", assignment: "投稿文を作って", expectMode: ["answer", "artifact"], expectNoExternal: true },
  { id: "x04", category: "external", assignment: "メール文を作って", expectMode: ["answer", "artifact"], expectNoExternal: true },
  { id: "x05", category: "external", assignment: "カレンダーに予定を登録して", expectMode: ["external_action", "mixed"], expectExternal: true },
  { id: "x06", category: "external", assignment: "カレンダー案を作って", expectMode: ["answer", "artifact"], expectNoExternal: true },
  { id: "x07", category: "external", assignment: "Driveに保存して", expectMode: ["external_action", "mixed"], expectExternal: true },
  { id: "x08", category: "external", assignment: "今すぐXへ投稿して", expectMode: ["external_action", "mixed"], expectExternal: true },
  { id: "x09", category: "external", assignment: "Slackに送って", expectMode: ["external_action", "mixed", "answer"] },
  { id: "x10", category: "external", assignment: "ツイート文案だけ考えて", expectMode: ["answer", "artifact"], expectNoExternal: true },

  // Automation 10
  { id: "a01", category: "automation", assignment: "毎日売上表を作って", expectMode: ["automation", "mixed"] },
  { id: "a02", category: "automation", assignment: "毎週月曜にPDFをメールして", expectMode: ["automation", "mixed"], expectExternal: true },
  { id: "a03", category: "automation", assignment: "毎朝Xへ投稿して", expectMode: ["automation", "mixed"], expectExternal: true },
  { id: "a04", category: "automation", assignment: "今日の売上表を作って", expectMode: ["artifact"], expectNoExternal: true },
  { id: "a05", category: "automation", assignment: "一度だけ来週送って", expectMode: ["mixed", "external_action", "answer"] },
  { id: "a06", category: "automation", assignment: "毎月請求書を作成して", expectMode: ["automation", "mixed"] },
  { id: "a07", category: "automation", assignment: "定期的にレポートを作って", expectMode: ["automation", "mixed"] },
  { id: "a08", category: "automation", assignment: "今日だけ投稿して", expectMode: ["external_action", "mixed"] },
  { id: "a09", category: "automation", assignment: "毎日家計簿を更新して", expectMode: ["automation", "mixed"] },
  { id: "a10", category: "automation", assignment: "毎週の営業資料を自動作成", expectMode: ["automation", "mixed"] },

  // Ambiguous 5+
  { id: "u01", category: "ambiguous", assignment: "いつものやつで", expectMode: ["answer", "artifact"], expectClarify: true, allowUnnecessaryClarify: true },
  { id: "u02", category: "ambiguous", assignment: "よろしく", expectMode: ["answer", "artifact"], expectClarify: true, allowUnnecessaryClarify: true },
  { id: "u03", category: "ambiguous", assignment: "見積もりお願い（品目未定）", expectMode: ["artifact"], expectMissing: true },
  { id: "u04", category: "ambiguous", assignment: "動画を生成して", expectMode: ["answer", "artifact"] },
  { id: "u05", category: "ambiguous", assignment: "あれどうなってる？", expectMode: ["answer"], allowUnnecessaryClarify: true },
  { id: "u06", category: "ambiguous", assignment: "資料作って", expectMode: ["artifact", "answer"], allowUnnecessaryClarify: true },
  { id: "u07", category: "ambiguous", assignment: "これやって", expectMode: ["answer", "artifact"], expectClarify: true, allowUnnecessaryClarify: true },
  { id: "u08", category: "ambiguous", assignment: "PDFで", expectMode: ["artifact", "answer"], expectFormats: ["pdf"] },
  { id: "u09", category: "ambiguous", assignment: "エクセルるで売上", expectMode: ["artifact"], expectFormats: ["xlsx"] },
  { id: "u10", category: "ambiguous", assignment: "契約書作って甲乙まだ未定", expectMode: ["artifact"], expectClarify: true },
];

export function evaluateCase(result: {
  mode: ExecutionMode;
  formats: string[];
  missing: string[];
  needsClarify: boolean;
  risks: string[];
  intent: string;
  unsupported?: boolean;
}, c: EvaluationCase): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!c.expectMode.includes(result.mode)) {
    reasons.push(`mode ${result.mode} not in ${c.expectMode.join("|")}`);
  }
  if (c.expectFormats) {
    for (const f of c.expectFormats) {
      const normalized = result.formats.map((x) => (x === "md" ? "markdown" : x));
      if (!result.formats.includes(f) && !normalized.includes(f)) {
        reasons.push(`missing format ${f}`);
      }
    }
  }
  if (c.expectFormatAnyOf) {
    const ok = c.expectFormatAnyOf.some((group) =>
      group.every((f) => result.formats.includes(f) || (f === "markdown" && result.formats.includes("md"))),
    );
    if (!ok) reasons.push(`formats ${result.formats.join(",")} not in any expected group`);
  }
  if (c.expectMissing && result.missing.length === 0 && !result.needsClarify) {
    reasons.push("expected missing fields");
  }
  if (c.expectClarify && !result.needsClarify && !c.allowUnnecessaryClarify) {
    reasons.push("expected clarification");
  }
  if (c.expectNoExternal && result.risks.includes("external_action_requires_confirmation")) {
    reasons.push("false external action");
  }
  if (c.expectExternal && !result.risks.includes("external_action_requires_confirmation") && result.mode !== "external_action" && result.mode !== "mixed" && result.mode !== "automation") {
    reasons.push("expected external/automation signal");
  }
  if (c.id === "u04" && !result.unsupported && result.intent !== "unsupported") {
    // video generation should be unsupported
    reasons.push("expected unsupported for video generation");
  }
  return { ok: reasons.length === 0, reasons };
}
