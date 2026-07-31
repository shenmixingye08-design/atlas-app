import type { VisionBatchResult, VisionDetectedType } from "@/lib/vision/types";

import { batchStructureToMarkdown } from "./structure-to-markdown";

/**
 * Convert vision batch into deliverable-facing content (tables / structured text).
 * Prefer documentStructure → human Word; never OCR-only dump.
 */
export function visionBatchToDeliverableContent(batch: VisionBatchResult): string {
  const structured = batchStructureToMarkdown(batch);
  if (structured.length >= 80) {
    return structured;
  }

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

  const title =
    (typeof batch.images[0]?.fields?.title === "string" &&
      String(batch.images[0].fields.title).trim()) ||
    "資料";
  return [
    `# ${title}`,
    "",
    "## 概要",
    batch.combinedSummary || "画像内容を整理しました。",
    "",
    ...batch.images.map((image, i) => {
      const bullets = image.visualElements.slice(0, 8).map((v) => `- ${v}`);
      return [
        `## 内容 ${i + 1}`,
        image.summary,
        "",
        image.extractedText?.trim()
          ? `### 読み取った内容\n\n${image.extractedText.trim()}`
          : "",
        bullets.length ? `### 要点\n\n${bullets.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
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
  const benefits = Array.isArray(f.benefits)
    ? (f.benefits as unknown[]).map((b) => `- ${String(b)}`)
    : asString(f.benefits)
      ? asString(f.benefits)
          .split(/[、,\n]/)
          .map((b) => b.trim())
          .filter(Boolean)
          .map((b) => `- ${b}`)
      : ["- ご提供価値を明確化してください"];
  const weaknesses = Array.isArray(f.weaknesses)
    ? (f.weaknesses as unknown[]).map((w) => `- ${String(w)}`)
    : image?.warnings.map((w) => `- ${w}`) ?? ["- （特記なし）"];
  return [
    "# 営業資料",
    "",
    "## 対象読者",
    asString(f.targetAudience) || "要確認",
    "",
    "## 主要メッセージ",
    asString(f.keyMessage) || image?.summary || "要確認",
    "",
    "## ベネフィット",
    ...benefits,
    "",
    "## 次のアクション",
    asString(f.callToAction) || "お気軽にお問い合わせください。",
    "",
    "## お問い合わせ",
    asString(f.contactInfo) || "要確認",
    "",
    "## 現状の課題",
    ...weaknesses,
    "",
    "## 改善方針",
    ...(image?.recommendedActions.map((a) => `- ${a}`) ?? [
      "- 見出しと要点を先に置く",
      "- 表と箇条書きで読みやすくする",
    ]),
  ].join("\n");
}

function buildContractMarkdown(batch: VisionBatchResult): string {
  return batch.images
    .map((image, i) => {
      const f = image.fields;
      const clauses = Array.isArray(f.keyClauses)
        ? (f.keyClauses as unknown[]).map((c) => String(c))
        : asString(f.keyClauses)
          ? [asString(f.keyClauses)]
          : ["条項を十分に読み取れませんでした。原紙をご確認ください。"];
      return [
        `# 契約書要約${batch.images.length > 1 ? `（${i + 1}）` : ""}`,
        "",
        "## 基本情報",
        `| 項目 | 内容 |`,
        `| --- | --- |`,
        `| 当事者 | ${asString(f.parties) || "要確認"} |`,
        `| 発効日 | ${asString(f.effectiveDate) || "要確認"} |`,
        `| 終了日 | ${asString(f.expiryDate) || "要確認"} |`,
        `| 金額 | ${asString(f.amounts) || "要確認"} |`,
        `| 準拠法 | ${asString(f.governingLaw) || "要確認"} |`,
        "",
        "## 重要条項",
        ...clauses.map((c, idx) => `${idx + 1}. ${c.replace(/^\d+\.\s*/, "")}`),
        "",
        "## 補足",
        image.extractedText?.trim() || "特記事項はありません。",
        image.missingFields.length
          ? `\n### 要確認\n\n${image.missingFields.map((m) => `- ${m}`).join("\n")}`
          : "",
      ].join("\n");
    })
    .join("\n\n---\n\n");
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
  return batch.images
    .map((image, i) => {
      const f = image.fields;
      return [
        `# 画面キャプチャ整理 ${i + 1}`,
        `- アプリ/サイト: ${asString(f.appOrSite) || "要確認"}`,
        `- 目的: ${asString(f.purpose) || image.summary}`,
        `- 主要UI文言: ${asString(f.keyUiText) || image.extractedText || "要確認"}`,
        "",
        "## 要約",
        image.summary,
        "",
        "## 抽出テキスト",
        image.extractedText || "（なし）",
      ].join("\n");
    })
    .join("\n\n");
}

function buildPhotoReportMarkdown(batch: VisionBatchResult): string {
  return [
    "# 写真レポート",
    "",
    "## 概要",
    batch.combinedSummary || "写真内容を整理しました。",
    "",
    ...batch.images.map((image, i) => {
      return [
        `## 写真 ${i + 1}`,
        "",
        "### 状況",
        image.summary,
        "",
        image.visualElements.length
          ? `### 確認できた要素\n\n${image.visualElements.map((v) => `- ${v}`).join("\n")}`
          : "",
        image.extractedText?.trim()
          ? `### 読み取った文字\n\n${image.extractedText.trim()}`
          : "",
        image.recommendedActions.length
          ? `### 次の対応\n\n${image.recommendedActions.map((a) => `1. ${a}`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }),
  ].join("\n");
}
