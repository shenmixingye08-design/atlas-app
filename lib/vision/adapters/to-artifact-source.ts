import type { VisionBatchResult, VisionDetectedType } from "@/lib/vision/types";

/**
 * Convert vision batch into deliverable-facing content (tables / structured text).
 * Used before generateDeliverables without modifying artifact-engine cores.
 */
export function visionBatchToDeliverableContent(batch: VisionBatchResult): string {
  const type =
    (batch.commonFields.detectedType as VisionDetectedType | undefined) ??
    batch.images[0]?.detectedType ??
    "unknown";

  if (type === "receipt" || batch.recommendedArtifactType === "household_excel") {
    return buildHouseholdMarkdown(batch);
  }
  if (type === "invoice" || batch.recommendedArtifactType === "invoice_excel") {
    return buildInvoiceMarkdown(batch);
  }
  if (
    type === "table" ||
    type === "spreadsheet_source" ||
    batch.recommendedArtifactType === "table_excel"
  ) {
    return buildTableMarkdown(batch);
  }
  if (type === "handwritten_note") {
    return buildHandwritingMarkdown(batch);
  }
  if (type === "business_card") {
    return buildBusinessCardMarkdown(batch);
  }
  if (type === "sales_material" || type === "business_document") {
    return buildSalesImproveMarkdown(batch);
  }

  return [
    `# 画像解析結果`,
    batch.combinedSummary,
    ...batch.images.map((image, i) => {
      return [
        `## 画像${i + 1}`,
        image.summary,
        image.extractedText ?? "",
      ].join("\n");
    }),
  ].join("\n\n");
}

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function buildHouseholdMarkdown(batch: VisionBatchResult): string {
  const rows: string[] = [
    "| 日付 | 分類 | 店名 | 内容 | 金額 | 支払方法 | 備考 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const image of batch.images) {
    const fields = image.fields;
    const store = asString(fields.storeName);
    const date = asString(fields.date);
    const method = asString(fields.paymentMethod);
    const items = Array.isArray(fields.items) ? fields.items : [];
    if (items.length === 0) {
      rows.push(
        `| ${date || "要確認"} | 未分類 | ${store || "要確認"} | ${image.summary} | ${asString(fields.total) || "要確認"} | ${method || ""} | ${image.missingFields.join(" ") || ""} |`,
      );
      continue;
    }
    for (const item of items) {
      const record = (item && typeof item === "object" ? item : {}) as Record<
        string,
        unknown
      >;
      rows.push(
        `| ${date || "要確認"} | ${asString(record.category) || "未分類"} | ${store || "要確認"} | ${asString(record.name) || "要確認"} | ${asString(record.amount) || "要確認"} | ${method || ""} | ${image.warnings[0] ?? ""} |`,
      );
    }
  }

  return [
    "# 家計簿",
    "画像から抽出した家計簿データです。読めない項目は「要確認」としています。",
    "",
    ...rows,
    "",
    batch.needsInput
      ? `## 要確認\n${batch.needsInput.fields.map((f) => `- ${f}`).join("\n")}`
      : "",
  ].join("\n");
}

function buildInvoiceMarkdown(batch: VisionBatchResult): string {
  const image = batch.images[0];
  const fields = image?.fields ?? {};
  const lines = [
    "# 請求書データ",
    `- 請求元: ${asString(fields.issuer) || "要確認"}`,
    `- 宛先: ${asString(fields.recipient) || "要確認"}`,
    `- 請求番号: ${asString(fields.invoiceNumber) || "要確認"}`,
    `- 発行日: ${asString(fields.issueDate) || "要確認"}`,
    `- 支払期限: ${asString(fields.dueDate) || "要確認"}`,
    `- 小計: ${asString(fields.subtotal) || "要確認"}`,
    `- 税: ${asString(fields.tax) || "要確認"}`,
    `- 合計: ${asString(fields.total) || "要確認"}`,
    `- 振込先: ${asString(fields.bankDetails) || "要確認"}`,
    "",
    "| 項目 | 数量 | 単価 | 金額 | 備考 |",
    "| --- | --- | --- | --- | --- |",
  ];
  const items = Array.isArray(fields.lineItems) ? fields.lineItems : [];
  for (const item of items) {
    const record = (item && typeof item === "object" ? item : {}) as Record<
      string,
      unknown
    >;
    lines.push(
      `| ${asString(record.name)} | ${asString(record.quantity)} | ${asString(record.unitPrice)} | ${asString(record.amount)} | ${asString(record.notes)} |`,
    );
  }
  if (batch.warnings.length > 0) {
    lines.push("", "## 警告", ...batch.warnings.map((w) => `- ${w}`));
  }
  return lines.join("\n");
}

function buildTableMarkdown(batch: VisionBatchResult): string {
  const table = batch.mergedTables[0] ?? batch.images[0]?.tables[0];
  if (!table) {
    return ["# 表データ", batch.combinedSummary, "表を十分に読み取れませんでした。"].join(
      "\n\n",
    );
  }
  const header = `| ${table.headers.join(" | ")} |`;
  const sep = `| ${table.headers.map(() => "---").join(" | ")} |`;
  const rows = table.rows.map(
    (row) =>
      `| ${row.map((cell) => (cell == null ? "（不明）" : String(cell))).join(" | ")} |`,
  );
  return ["# 表データ", header, sep, ...rows].join("\n");
}

function buildHandwritingMarkdown(batch: VisionBatchResult): string {
  return batch.images
    .map((image, i) => {
      const fields = image.fields;
      return [
        `# 手書きメモ ${i + 1}`,
        "## 原文転記",
        asString(fields.rawText) || image.extractedText || "（読めませんでした）",
        "",
        "## 整形版",
        asString(fields.cleanedText) || "（整形版なし）",
        "",
        "## 要約",
        asString(fields.summary) || image.summary,
        image.missingFields.length
          ? `\n不鮮明・要確認: ${image.missingFields.join("、")}`
          : "",
      ].join("\n");
    })
    .join("\n\n");
}

function buildBusinessCardMarkdown(batch: VisionBatchResult): string {
  return batch.images
    .map((image, i) => {
      const f = image.fields;
      return [
        `# 名刺 ${i + 1}`,
        `- 氏名: ${asString(f.personName) || "要確認"}`,
        `- 会社: ${asString(f.companyName) || "要確認"}`,
        `- 部署: ${asString(f.department) || "要確認"}`,
        `- 役職: ${asString(f.title) || "要確認"}`,
        `- 電話: ${asString(f.phone) || "要確認"}`,
        `- メール: ${asString(f.email) || "要確認"}`,
        `- 住所: ${asString(f.address) || "要確認"}`,
        `- Web: ${asString(f.website) || "要確認"}`,
        "",
        "※連絡先の保存はユーザー承認後のみ行います。",
      ].join("\n");
    })
    .join("\n\n");
}

function buildSalesImproveMarkdown(batch: VisionBatchResult): string {
  const image = batch.images[0];
  const f = image?.fields ?? {};
  return [
    "# 営業資料の改善版ドラフト",
    "",
    `## 対象読者\n${asString(f.targetAudience) || "要確認"}`,
    `## 主要メッセージ\n${asString(f.keyMessage) || image?.summary || ""}`,
    `## ベネフィット\n${asString(f.benefits) || ""}`,
    `## CTA\n${asString(f.callToAction) || "要確認"}`,
    `## 問い合わせ\n${asString(f.contactInfo) || "要確認"}`,
    "",
    "## 現状の課題",
    asString(f.weaknesses) ||
      (Array.isArray(f.weaknesses)
        ? (f.weaknesses as unknown[]).map((w) => `- ${String(w)}`).join("\n")
        : image?.warnings.map((w) => `- ${w}`).join("\n") || "- （特記なし）"),
    "",
    "## 改善方針",
    ...(image?.recommendedActions.map((a) => `- ${a}`) ?? ["- 読みやすさとCTAを明確化"]),
    "",
    "## 参考抽出テキスト",
    image?.extractedText ?? "",
  ].join("\n");
}
