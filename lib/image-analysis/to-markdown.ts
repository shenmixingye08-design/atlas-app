import type { ImageAnalysisResult } from "./types";

function escapeCell(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function markdownTable(headers: string[], rows: Array<Array<unknown>>): string {
  if (headers.length === 0) return "";
  const head = `| ${headers.map(escapeCell).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${row.map(escapeCell).join(" | ")} |`)
    .join("\n");
  return [head, sep, body].filter(Boolean).join("\n");
}

/** Human-readable markdown summary derived from structured analysis JSON. */
export function imageAnalysisToMarkdown(analysis: ImageAnalysisResult): string {
  const lines: string[] = [
    `# ${analysis.title}`,
    "",
    `- 種別: ${analysis.documentType}`,
    `- 信頼度: ${Math.round(analysis.confidence * 100)}%`,
    `- 要確認: ${analysis.requiresReview ? "はい" : "いいえ"}`,
  ];

  if (analysis.warnings.length > 0) {
    lines.push("", "## 警告");
    for (const warning of analysis.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (analysis.documentType === "handwritten") {
    lines.push("", "## 原文（文字起こし）", "", analysis.fields.transcript || "（空）");
    lines.push("", "## 整理版", "", analysis.fields.cleanedText || "（空）");
    if (analysis.rows.length > 0) {
      lines.push(
        "",
        "## ToDo",
        "",
        markdownTable(
          ["内容", "担当", "期限", "優先度"],
          analysis.rows.map((row) => [
            row.title,
            row.assignee,
            row.dueDate,
            row.priority,
          ]),
        ),
      );
    }
    return lines.join("\n");
  }

  if (analysis.documentType === "business_card") {
    const contacts = analysis.fields.contacts ?? analysis.rows;
    lines.push(
      "",
      "## 連絡先一覧",
      "",
      markdownTable(
        ["氏名", "会社", "部署", "役職", "電話", "メール"],
        contacts.map((c) => [
          c.fullName,
          c.company,
          c.department,
          c.title,
          c.phone ?? c.mobile,
          c.email,
        ]),
      ),
    );
    return lines.join("\n");
  }

  if (analysis.documentType === "receipt") {
    lines.push("", "## レシート情報");
    lines.push(`- 購入日: ${analysis.fields.purchaseDate ?? "要確認"}`);
    lines.push(`- 店舗: ${analysis.fields.storeName ?? "要確認"}`);
    lines.push(`- 合計: ${analysis.fields.totalAmount ?? "要確認"}`);
    lines.push(
      "",
      "## 商品明細",
      "",
      markdownTable(
        ["商品名", "数量", "単価", "小計", "カテゴリ"],
        analysis.rows.map((row) => [
          row.name,
          row.quantity,
          row.unitPrice,
          row.subtotal,
          row.category,
        ]),
      ),
    );
    return lines.join("\n");
  }

  if (analysis.documentType === "invoice" || analysis.documentType === "estimate") {
    lines.push("", "## 書類情報");
    for (const [key, value] of Object.entries(analysis.fields)) {
      lines.push(`- ${key}: ${value ?? "要確認"}`);
    }
    lines.push(
      "",
      "## 明細",
      "",
      markdownTable(
        ["品名", "数量", "単価", "金額"],
        analysis.rows.map((row) => [
          row.name,
          row.quantity,
          row.unitPrice,
          row.amount,
        ]),
      ),
    );
    return lines.join("\n");
  }

  if (analysis.documentType === "table") {
    const columns = analysis.fields.columns;
    lines.push(
      "",
      "## 抽出表",
      "",
      markdownTable(
        columns,
        analysis.rows.map((row) => columns.map((col) => row[col] ?? "")),
      ),
    );
    return lines.join("\n");
  }

  lines.push("", "```json", JSON.stringify(analysis, null, 2), "```");
  return lines.join("\n");
}
