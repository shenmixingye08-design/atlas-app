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

  if (
    type === "receipt" ||
    type === "receipt_voucher" ||
    batch.recommendedArtifactType === "household_excel"
  ) {
    return buildHouseholdMarkdown(batch);
  }
  if (
    type === "invoice" ||
    type === "delivery_note" ||
    batch.recommendedArtifactType === "invoice_excel"
  ) {
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
  if (
    type === "business_card" ||
    batch.recommendedArtifactType === "contact_list_excel"
  ) {
    return buildContactListMarkdown(batch);
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
    batch.recommendedArtifactType === "screenshot_summary_docx" ||
    batch.recommendedArtifactType === "manual_docx"
  ) {
    return buildManualMarkdown(batch);
  }
  if (
    type === "meeting_minutes" ||
    type === "whiteboard" ||
    batch.recommendedArtifactType === "meeting_minutes_docx"
  ) {
    return buildMeetingMinutesMarkdown(batch);
  }
  if (
    type === "construction_photo" ||
    batch.recommendedArtifactType === "construction_report_docx"
  ) {
    return buildConstructionReportMarkdown(batch);
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

function buildContactListMarkdown(batch: VisionBatchResult): string {
  const rows: string[] = [
    "| 氏名 | 会社 | 部署 | 役職 | 電話 | メール | 住所 | Web | 備考 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const image of batch.images) {
    const f = image.fields;
    rows.push(
      `| ${asString(f.personName) || asString(f.name) || "要確認"} | ${asString(f.companyName) || "要確認"} | ${asString(f.department) || ""} | ${asString(f.title) || ""} | ${asString(f.phone) || ""} | ${asString(f.email) || ""} | ${asString(f.address) || ""} | ${asString(f.website) || asString(f.url) || ""} | ${image.missingFields.join(" ") || ""} |`,
    );
  }
  const csvLines = [
    "氏名,会社,部署,役職,電話,メール,住所,Web",
    ...batch.images.map((image) => {
      const f = image.fields;
      const cells = [
        asString(f.personName) || asString(f.name),
        asString(f.companyName),
        asString(f.department),
        asString(f.title),
        asString(f.phone),
        asString(f.email),
        asString(f.address),
        asString(f.website) || asString(f.url),
      ].map((c) => `"${c.replace(/"/g, '""')}"`);
      return cells.join(",");
    }),
  ];
  return [
    "# 連絡先一覧",
    "名刺画像から抽出した連絡先です。保存はユーザー承認後のみ行います。",
    "",
    ...rows,
    "",
    "## CSV（参考）",
    "```csv",
    ...csvLines,
    "```",
  ].join("\n");
}

function buildMeetingMinutesMarkdown(batch: VisionBatchResult): string {
  return [
    "# 議事録",
    "",
    `## 概要\n${batch.combinedSummary}`,
    "",
    ...batch.images.map((image, i) => {
      const f = image.fields;
      const decisions = Array.isArray(f.decisions)
        ? (f.decisions as unknown[]).map((d) => `- ${String(d)}`)
        : asString(f.decisions)
          ? [`- ${asString(f.decisions)}`]
          : ["- （要確認）"];
      const actions = Array.isArray(f.actionItems)
        ? (f.actionItems as unknown[]).map((d) => `- ${String(d)}`)
        : image.recommendedActions.map((a) => `- ${a}`);
      return [
        `## 会議記録 ${i + 1}`,
        `- 日時: ${asString(f.date) || asString(f.meetingDate) || "要確認"}`,
        `- 場所/形式: ${asString(f.location) || "要確認"}`,
        `- 出席者: ${asString(f.attendees) || "要確認"}`,
        "",
        "### 議題・内容",
        asString(f.agenda) ||
          asString(f.cleanedText) ||
          image.extractedText ||
          image.summary,
        "",
        "### 決定事項",
        ...decisions,
        "",
        "### アクション",
        ...(actions.length ? actions : ["- （なし）"]),
        image.layout?.title ? `\nレイアウト題名: ${image.layout.title}` : "",
      ].join("\n");
    }),
  ].join("\n");
}

function buildConstructionReportMarkdown(batch: VisionBatchResult): string {
  return [
    "# 施工報告書",
    "",
    `## 総括\n${batch.combinedSummary}`,
    "",
    ...batch.images.map((image, i) => {
      const f = image.fields;
      return [
        `## 施工写真 ${i + 1}`,
        `- 現場: ${asString(f.siteName) || asString(f.location) || "要確認"}`,
        `- 日付: ${asString(f.date) || "要確認"}`,
        `- 工事内容: ${asString(f.workDescription) || image.summary}`,
        `- 進捗: ${asString(f.progress) || "要確認"}`,
        `- 安全・品質メモ: ${asString(f.safetyNotes) || asString(f.notes) || "特記なし"}`,
        image.visualElements.length
          ? `- 写っているもの: ${image.visualElements.join("、")}`
          : null,
        image.extractedText ? `\n### 画像内文字\n${image.extractedText}` : null,
        "",
        "### 所見",
        image.recommendedActions.length
          ? image.recommendedActions.map((a) => `- ${a}`).join("\n")
          : "- 写真内容を確認し、必要なら追加撮影してください。",
      ]
        .filter(Boolean)
        .join("\n");
    }),
  ].join("\n");
}

function buildManualMarkdown(batch: VisionBatchResult): string {
  return [
    "# 操作マニュアル（画面キャプチャより）",
    "",
    batch.combinedSummary,
    "",
    ...batch.images.map((image, i) => {
      const f = image.fields;
      const steps = Array.isArray(f.steps)
        ? (f.steps as unknown[]).map((s, idx) => `${idx + 1}. ${String(s)}`)
        : image.recommendedActions.map((a, idx) => `${idx + 1}. ${a}`);
      return [
        `## 手順 ${i + 1}: ${asString(f.purpose) || image.summary}`,
        `- 画面/アプリ: ${asString(f.appOrSite) || "要確認"}`,
        "",
        "### 操作ステップ",
        ...(steps.length ? steps : ["1. 画面の内容を確認する", "2. 必要操作を実行する"]),
        "",
        "### 画面上の文言",
        asString(f.keyUiText) || image.extractedText || "（なし）",
        image.layout?.headings?.length
          ? `\n見出し: ${image.layout.headings.join(" / ")}`
          : "",
      ].join("\n");
    }),
  ].join("\n");
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
