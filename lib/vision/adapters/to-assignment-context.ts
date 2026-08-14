import type { VisionBatchResult, VisionDetectedType } from "@/lib/vision/types";
import { labelForDetectedType } from "@/lib/vision/classify";

function formatFields(fields: Record<string, unknown>, indent = 0): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) {
      lines.push(`${pad}- ${key}: （要確認）`);
      continue;
    }
    if (Array.isArray(value)) {
      lines.push(`${pad}- ${key}:`);
      for (const item of value) {
        if (item && typeof item === "object") {
          lines.push(`${pad}  -`);
          lines.push(formatFields(item as Record<string, unknown>, indent + 2));
        } else {
          lines.push(`${pad}  - ${String(item)}`);
        }
      }
      continue;
    }
    if (typeof value === "object") {
      lines.push(`${pad}- ${key}:`);
      lines.push(formatFields(value as Record<string, unknown>, indent + 1));
      continue;
    }
    lines.push(`${pad}- ${key}: ${String(value)}`);
  }
  return lines.join("\n");
}

function formatTables(
  tables: VisionBatchResult["mergedTables"],
): string {
  if (tables.length === 0) return "";
  return tables
    .map((table, index) => {
      const header = table.headers.join(" | ");
      const rows = table.rows
        .map((row) => row.map((cell) => (cell == null ? "（不明）" : String(cell))).join(" | "))
        .join("\n");
      return [`【表${index + 1}】`, header, rows, table.notes ? `注: ${table.notes}` : ""]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function artifactInstruction(
  type: VisionDetectedType,
  recommended: string | null,
  userText: string,
): string {
  if (recommended === "household_excel" || type === "receipt") {
    return "画像から抽出した家計簿データを使い、明細（日付・店舗・カテゴリ・商品名・数量・単価・金額・支払方法・メモ）と集計（総支出・レシート件数・カテゴリ別・店舗別・日別）のExcelを生成してください。読めない項目は空欄または要確認とし、勝手に埋めないでください。金額は数値、日付は日付型にしてください。";
  }
  if (recommended === "invoice_excel" || type === "invoice") {
    return "請求書の構造化データから明細Excel（必要ならPDF/Word要約）を生成してください。読めない項目は警告として残してください。";
  }
  if (recommended === "table_excel" || type === "table" || type === "spreadsheet_source") {
    return "表構造を復元したExcelを生成してください。数値・日付型を保ち、読めないセルは（不明）と明示してください。";
  }
  if (recommended === "improved_sales_doc" || type === "sales_material") {
    return "営業資料の課題を踏まえ、改善版の提案資料（見出し・CTA・問い合わせ欄を含む）をArtifactDocumentとして生成してください。";
  }
  if (recommended === "memo_text" || type === "handwritten_note") {
    return "手書きメモについて【原文転記】【整形版】【要約】を分けて提示してください。不鮮明箇所は推測で埋めないでください。";
  }
  if (recommended === "contact_card" || type === "business_card") {
    return "名刺情報を構造化して整理してください。連絡先登録やプロフィール保存は提案のみとし、ユーザー承認なしでは実行しないでください。";
  }
  if (recommended === "contract_docx" || type === "contract") {
    return "契約書の当事者・日付・金額・重要条項を要約したWord/PDFを生成してください。読めない条項は要確認とし、勝手に補完しないでください。";
  }
  if (recommended === "chart_report_docx" || type === "chart") {
    return "グラフの種類・軸・数値・傾向・示唆をまとめた分析レポート（Word/PDF）を生成してください。";
  }
  if (recommended === "screenshot_summary_docx" || type === "screenshot") {
    return "画面キャプチャの内容を整理した要約文書を生成してください。";
  }
  if (
    recommended === "photo_report_docx" ||
    type === "general_photo" ||
    type === "property_photo" ||
    type === "equipment_photo"
  ) {
    return "写真の内容を理解したレポート（何が写っているか・次の行動）をWord/PDFで生成してください。";
  }
  return userText.trim()
    ? "上記の画像解析結果を正式な入力ソースとして成果物を作成してください。"
    : "画像解析結果を整理し、必要なら成果物を提案してください。";
}

/**
 * Enrich assignment text with structured vision context for existing pipelines
 * (without changing Planner/Deliverable cores).
 */
export function buildVisionEnrichedAssignment(input: {
  assignment: string;
  batch: VisionBatchResult;
}): string {
  const dominant =
    (input.batch.commonFields.detectedType as VisionDetectedType | undefined) ??
    input.batch.images[0]?.detectedType ??
    "unknown";

  const perImage = input.batch.images
    .map((image, index) => {
      const parts = [
        `### 画像${index + 1}（attachmentId: ${image.attachmentId}）`,
        labelForDetectedType(image.detectedType),
        `信頼度: ${Math.round(image.confidence * 100)}%`,
        `要約: ${image.summary}`,
        image.extractedText ? `抽出テキスト:\n${image.extractedText}` : null,
        Object.keys(image.fields).length > 0
          ? `構造化フィールド:\n${formatFields(image.fields)}`
          : null,
        image.tables.length > 0 ? formatTables(image.tables) : null,
        image.layout
          ? `レイアウト: ${JSON.stringify(image.layout)}`
          : null,
        image.missingFields.length > 0
          ? `要確認: ${image.missingFields.join("、")}`
          : null,
        image.warnings.length > 0 ? `警告: ${image.warnings.join("、")}` : null,
        image.fieldConfidence
          ? `項目確信度: ${JSON.stringify(image.fieldConfidence)}`
          : null,
      ];
      return parts.filter(Boolean).join("\n");
    })
    .join("\n\n");

  const sections = [
    input.assignment.trim(),
    "",
    "===== 画像理解結果（VisionAnalysis）=====",
    `総合要約: ${input.batch.combinedSummary}`,
    `推奨成果物: ${input.batch.recommendedArtifactType ?? "自動判定"}`,
    artifactInstruction(dominant, input.batch.recommendedArtifactType, input.assignment),
    "",
    perImage,
    input.batch.mergedTables.length > 0
      ? `\n===== 統合表 =====\n${formatTables(input.batch.mergedTables)}`
      : "",
    input.batch.needsInput
      ? `\n【不足情報】${input.batch.needsInput.message}: ${input.batch.needsInput.fields.join("、")}`
      : "",
    "===== ここまで画像理解結果 =====",
  ];

  return sections.filter((line) => line !== undefined).join("\n");
}
