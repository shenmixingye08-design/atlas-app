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
  if (type === "contract" || batch.recommendedArtifactType === "contract_docx") {
    return buildContractMarkdown(batch);
  }
  if (type === "chart" || batch.recommendedArtifactType === "chart_report_docx") {
    return buildChartMarkdown(batch);
  }
  if (
    type === "screenshot" ||
    batch.recommendedArtifactType === "screenshot_summary_docx"
  ) {
    return buildScreenshotMarkdown(batch);
  }
  if (
    type === "general_photo" ||
    type === "property_photo" ||
    type === "equipment_photo" ||
    batch.recommendedArtifactType === "photo_report_docx"
  ) {
    return buildPhotoReportMarkdown(batch);
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

function cellOrReview(value: unknown, confidence: number, threshold = 0.55): string {
  const text = asString(value).trim();
  if (!text) return "要確認";
  if (confidence < threshold) return "要確認";
  return text.replace(/\|/g, "／");
}

function markdownTable(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(
      (row) =>
        `| ${row.map((cell) => (cell.trim() ? cell : "要確認")).join(" | ")} |`,
    ),
  ].join("\n");
}

function splitExtractedLines(text: string, confidence: number): string[][] {
  const chunks: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.length <= 120) {
      chunks.push(trimmed);
      continue;
    }
    for (let i = 0; i < trimmed.length; i += 120) {
      chunks.push(trimmed.slice(i, i + 120));
    }
  }
  return chunks.slice(0, 200).map((chunk, index) => [
    String(index + 1),
    cellOrReview(chunk, confidence),
    confidence < 0.55 ? "要確認" : String(Math.round(confidence * 100)),
  ]);
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
        `| ${cellOrReview(date, image.confidence)} | 未分類 | ${cellOrReview(store, image.confidence)} | ${cellOrReview(image.summary, image.confidence)} | ${cellOrReview(fields.total, image.confidence)} | ${method || ""} | ${image.missingFields.join(" ") || ""} |`,
      );
      continue;
    }
    for (const item of items) {
      const record = (item && typeof item === "object" ? item : {}) as Record<
        string,
        unknown
      >;
      rows.push(
        `| ${cellOrReview(date, image.confidence)} | ${asString(record.category) || "未分類"} | ${cellOrReview(store, image.confidence)} | ${cellOrReview(record.name, image.confidence)} | ${cellOrReview(record.amount, image.confidence)} | ${method || ""} | ${image.warnings[0] ?? ""} |`,
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
    return [
      "# 表データ",
      markdownTable(
        ["項目", "内容", "確信度"],
        [["読み取り", "表を十分に読み取れませんでした。", "要確認"]],
      ),
    ].join("\n\n");
  }
  const confidence = batch.images[0]?.confidence ?? 0.5;
  const rows = table.rows.map((row) =>
    row.map((cell) =>
      cell == null || String(cell).trim() === ""
        ? "要確認"
        : cellOrReview(cell, confidence),
    ),
  );
  return ["# 表データ", markdownTable(table.headers, rows)].join("\n");
}

function buildHandwritingMarkdown(batch: VisionBatchResult): string {
  const table = batch.mergedTables[0] ?? batch.images.find((i) => i.tables[0])?.tables[0];
  if (table) return buildTableMarkdown(batch);

  const blocks: string[] = ["# 手書きメモ"];
  for (const [index, image] of batch.images.entries()) {
    const text =
      asString(image.fields.rawText) ||
      image.extractedText ||
      asString(image.fields.cleanedText) ||
      "";
    const rows = splitExtractedLines(text, image.confidence);
    if (rows.length === 0) {
      rows.push(["1", "要確認", "要確認"]);
    }
    blocks.push(
      `## メモ ${index + 1}`,
      markdownTable(["行", "内容", "確信度"], rows),
      image.missingFields.length
        ? `要確認: ${image.missingFields.join("、")}`
        : "",
    );
  }
  return blocks.filter(Boolean).join("\n\n");
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

function buildContractMarkdown(batch: VisionBatchResult): string {
  return batch.images
    .map((image, i) => {
      const f = image.fields;
      const clauses = Array.isArray(f.keyClauses)
        ? (f.keyClauses as unknown[]).map((c, idx) => `${idx + 1}. ${String(c)}`)
        : asString(f.keyClauses)
          ? [asString(f.keyClauses)]
          : ["（条項を十分に読み取れませんでした）"];
      return [
        `# 契約書要約 ${i + 1}`,
        `- 当事者: ${asString(f.parties) || "要確認"}`,
        `- 契約日/発効日: ${asString(f.effectiveDate) || "要確認"}`,
        `- 終了日: ${asString(f.expiryDate) || "要確認"}`,
        `- 金額: ${asString(f.amounts) || "要確認"}`,
        `- 準拠法: ${asString(f.governingLaw) || "要確認"}`,
        "",
        "## 重要条項",
        ...clauses.map((c) => (c.startsWith("-") ? c : `- ${c}`)),
        "",
        "## 抽出テキスト",
        image.extractedText || "（なし）",
        image.missingFields.length
          ? `\n要確認: ${image.missingFields.join("、")}`
          : "",
      ].join("\n");
    })
    .join("\n\n");
}

function buildChartMarkdown(batch: VisionBatchResult): string {
  return batch.images
    .map((image, i) => {
      const f = image.fields;
      const insights = Array.isArray(f.insights)
        ? (f.insights as unknown[]).map((x) => `- ${String(x)}`)
        : asString(f.insights)
          ? [`- ${asString(f.insights)}`]
          : [`- ${image.summary}`];
      const table = image.tables[0];
      const tableMd = table
        ? [
            `| ${table.headers.join(" | ")} |`,
            `| ${table.headers.map(() => "---").join(" | ")} |`,
            ...table.rows.map(
              (row) =>
                `| ${row.map((c) => (c == null ? "（不明）" : String(c))).join(" | ")} |`,
            ),
          ].join("\n")
        : "（数値表を十分に読み取れませんでした）";
      return [
        `# グラフ分析 ${i + 1}`,
        `- 種類: ${asString(f.chartType) || "要確認"}`,
        `- タイトル: ${asString(f.title) || image.summary}`,
        `- X軸: ${asString(f.xAxis) || "要確認"}`,
        `- Y軸: ${asString(f.yAxis) || "要確認"}`,
        `- 系列: ${asString(f.series) || "要確認"}`,
        `- 傾向: ${asString(f.trend) || "要確認"}`,
        "",
        "## 読み取った数値",
        tableMd,
        "",
        "## 示唆",
        ...insights,
      ].join("\n");
    })
    .join("\n\n");
}

function buildScreenshotMarkdown(batch: VisionBatchResult): string {
  const table =
    batch.mergedTables[0] ??
    batch.images.find((image) => image.tables[0])?.tables[0];
  if (table) return buildTableMarkdown(batch);

  const rows: string[][] = [];
  for (const image of batch.images) {
    const f = image.fields;
    rows.push([
      "アプリ/サイト",
      cellOrReview(f.appOrSite, image.confidence),
      String(Math.round(image.confidence * 100)),
    ]);
    rows.push([
      "目的",
      cellOrReview(f.purpose || image.summary, image.confidence),
      String(Math.round(image.confidence * 100)),
    ]);
    const extracted = image.extractedText || asString(f.keyUiText);
    for (const line of splitExtractedLines(extracted, image.confidence)) {
      rows.push(["抽出テキスト", line[1] ?? "要確認", line[2] ?? "要確認"]);
    }
  }
  if (rows.length === 0) {
    rows.push(["読み取り", "要確認", "要確認"]);
  }
  return ["# 画面キャプチャ", markdownTable(["項目", "内容", "確信度"], rows)].join(
    "\n\n",
  );
}

function buildPhotoReportMarkdown(batch: VisionBatchResult): string {
  return [
    "# 写真レポート",
    batch.combinedSummary,
    "",
    ...batch.images.map((image, i) => {
      return [
        `## 写真${i + 1}`,
        `- 種別: ${image.detectedType}`,
        `- 要約: ${image.summary}`,
        image.visualElements.length
          ? `- 写っているもの: ${image.visualElements.join("、")}`
          : null,
        image.extractedText ? `- 文字: ${image.extractedText}` : null,
        image.recommendedActions.length
          ? `- 次の行動: ${image.recommendedActions.join(" / ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
    }),
  ].join("\n");
}
