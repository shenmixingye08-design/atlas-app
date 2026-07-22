import "server-only";

import ExcelJS from "exceljs";

import type {
  BusinessCardImageAnalysis,
  HandwrittenImageAnalysis,
  ImageAnalysisResult,
  InvoiceImageAnalysis,
  ReceiptImageAnalysis,
  TableImageAnalysis,
} from "./types";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F4E79" },
};
const ZEBRA_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF7F9FC" },
};
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFB0B8C4" } },
  left: { style: "thin", color: { argb: "FFB0B8C4" } },
  bottom: { style: "thin", color: { argb: "FFB0B8C4" } },
  right: { style: "thin", color: { argb: "FFB0B8C4" } },
};

const DATE_PATTERN = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/;

export function sanitizeSheetName(name: string, index = 0): string {
  const cleaned = name
    .replace(/[\\/*?:\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || `Sheet${index + 1}`;
}

function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Yu Gothic" };
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  row.height = 22;
}

function styleBodyCell(cell: ExcelJS.Cell, zebra: boolean): void {
  cell.border = THIN_BORDER;
  cell.font = { name: "Yu Gothic", size: 11 };
  cell.alignment = { vertical: "middle", wrapText: true };
  if (zebra) cell.fill = ZEBRA_FILL;
}

function autoWidth(sheet: ExcelJS.Worksheet, columnCount: number): void {
  for (let col = 1; col <= columnCount; col += 1) {
    const column = sheet.getColumn(col);
    let max = 10;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const text = String(cell.value ?? "");
      max = Math.min(48, Math.max(max, [...text].length + 2));
    });
    column.width = max;
  }
}

function setCellValue(cell: ExcelJS.Cell, value: unknown): void {
  if (value == null || value === "") {
    cell.value = "";
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    cell.value = value;
    cell.numFmt = Number.isInteger(value) ? "#,##0" : "#,##0.00";
    return;
  }
  if (typeof value === "string") {
    const dateMatch = value.trim().match(DATE_PATTERN);
    if (dateMatch) {
      const date = new Date(
        Date.UTC(
          Number(dateMatch[1]),
          Number(dateMatch[2]) - 1,
          Number(dateMatch[3]),
        ),
      );
      if (!Number.isNaN(date.getTime())) {
        cell.value = date;
        cell.numFmt = "yyyy/mm/dd";
        return;
      }
    }
    if (value.trim().startsWith("=")) {
      cell.value = { formula: value.trim().replace(/^=/, "") };
      return;
    }
  }
  cell.value = String(value);
}

function writeMatrix(
  sheet: ExcelJS.Worksheet,
  headers: string[],
  rows: unknown[][],
  options?: { freeze?: boolean; autofilter?: boolean },
): void {
  const headerRow = sheet.addRow(headers);
  styleHeader(headerRow);

  rows.forEach((row, rowIndex) => {
    const excelRow = sheet.addRow(headers.map(() => null));
    headers.forEach((_, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      setCellValue(cell, row[colIndex]);
      styleBodyCell(cell, rowIndex % 2 === 1);
    });
  });

  if (options?.freeze !== false) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }
  if (options?.autofilter !== false && headers.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, rows.length + 1), column: headers.length },
    };
  }
  autoWidth(sheet, headers.length);
}

function writeKeyValueSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  entries: Array<[string, unknown]>,
): void {
  const sheet = workbook.addWorksheet(sanitizeSheetName(name));
  writeMatrix(
    sheet,
    ["項目", "値"],
    entries.map(([key, value]) => [key, value ?? ""]),
  );
}

function buildReceiptWorkbook(analysis: ReceiptImageAnalysis): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MINERVOT";

  const expenseSheet = workbook.addWorksheet(sanitizeSheetName("支出一覧"));
  writeMatrix(expenseSheet, ["購入日", "購入時刻", "店舗名", "合計金額", "支払方法", "税額", "備考"], [
    [
      analysis.fields.purchaseDate,
      analysis.fields.purchaseTime,
      analysis.fields.storeName,
      analysis.fields.totalAmount,
      analysis.fields.paymentMethod,
      analysis.fields.taxAmount,
      analysis.warnings.join(" / "),
    ],
  ]);

  const itemsSheet = workbook.addWorksheet(sanitizeSheetName("商品明細"));
  const itemHeaders = [
    "商品名",
    "数量",
    "単価",
    "小計",
    "値引き",
    "税率",
    "カテゴリ",
    "備考",
  ];
  writeMatrix(
    itemsSheet,
    itemHeaders,
    analysis.rows.map((row) => [
      row.name,
      row.quantity,
      row.unitPrice,
      row.subtotal,
      row.discount,
      row.taxRate,
      row.category,
      row.note ?? "",
    ]),
  );

  if (analysis.rows.length > 0) {
    const totalRow = itemsSheet.addRow([]);
    totalRow.getCell(1).value = "合計";
    totalRow.getCell(1).font = { bold: true, name: "Yu Gothic" };
    totalRow.getCell(4).value = {
      formula: `SUM(D2:D${analysis.rows.length + 1})`,
    };
    totalRow.getCell(4).numFmt = "#,##0";
    totalRow.eachCell((cell) => {
      cell.border = THIN_BORDER;
    });
  }

  const categoryMap = new Map<string, number>();
  for (const row of analysis.rows) {
    const key = row.category || "その他";
    const amount =
      typeof row.subtotal === "number"
        ? row.subtotal
        : typeof row.unitPrice === "number" && typeof row.quantity === "number"
          ? row.unitPrice * row.quantity
          : 0;
    categoryMap.set(key, (categoryMap.get(key) ?? 0) + amount);
  }
  const categorySheet = workbook.addWorksheet(sanitizeSheetName("カテゴリ集計"));
  writeMatrix(
    categorySheet,
    ["カテゴリ", "合計"],
    [...categoryMap.entries()].map(([category, total]) => [category, total]),
  );

  const monthKey = (analysis.fields.purchaseDate ?? "").slice(0, 7) || "要確認";
  const monthSheet = workbook.addWorksheet(sanitizeSheetName("月別集計"));
  writeMatrix(monthSheet, ["年月", "合計"], [
    [monthKey, analysis.fields.totalAmount ?? 0],
  ]);

  return workbook;
}

function buildInvoiceWorkbook(analysis: InvoiceImageAnalysis): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  writeKeyValueSheet(workbook, "書類情報", [
    ["書類種別", analysis.fields.documentKind],
    ["発行日", analysis.fields.issueDate],
    ["請求日", analysis.fields.billingDate],
    ["支払期限", analysis.fields.dueDate],
    ["番号", analysis.fields.documentNumber],
    ["発行元", analysis.fields.issuerName],
    ["宛先", analysis.fields.recipientName],
    ["郵便番号", analysis.fields.postalCode],
    ["住所", analysis.fields.address],
    ["電話", analysis.fields.phone],
    ["メール", analysis.fields.email],
    ["振込先", analysis.fields.bankAccount],
    ["備考", analysis.fields.notes],
  ]);

  const detail = workbook.addWorksheet(sanitizeSheetName("明細"));
  writeMatrix(
    detail,
    ["品名", "数量", "単価", "金額", "備考"],
    analysis.rows.map((row) => [
      row.name,
      row.quantity,
      row.unitPrice,
      row.amount,
      row.note ?? "",
    ]),
  );
  if (analysis.rows.length > 0) {
    const totalRow = detail.addRow([]);
    totalRow.getCell(1).value = "合計";
    totalRow.getCell(1).font = { bold: true, name: "Yu Gothic" };
    totalRow.getCell(4).value = {
      formula: `SUM(D2:D${analysis.rows.length + 1})`,
    };
    totalRow.getCell(4).numFmt = "#,##0";
  }

  writeKeyValueSheet(workbook, "金額集計", [
    ["小計", analysis.fields.subtotal],
    ["消費税", analysis.fields.taxAmount],
    ["合計", analysis.fields.totalAmount],
  ]);

  return workbook;
}

function buildTableWorkbook(analysis: TableImageAnalysis): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sanitizeSheetName(analysis.title || "データ"));
  const columns = analysis.fields.columns;
  writeMatrix(
    sheet,
    columns,
    analysis.rows.map((row) => columns.map((col) => row[col] ?? "空欄")),
  );
  return workbook;
}

function buildBusinessCardWorkbook(
  analysis: BusinessCardImageAnalysis,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sanitizeSheetName("連絡先一覧"));
  const contacts = analysis.fields.contacts ?? analysis.rows;
  writeMatrix(
    sheet,
    [
      "氏名",
      "氏名ふりがな",
      "会社名",
      "部署名",
      "役職",
      "郵便番号",
      "住所",
      "電話番号",
      "携帯電話番号",
      "FAX",
      "メールアドレス",
      "Webサイト",
      "SNS",
      "備考",
      "sourceFileId",
    ],
    contacts.map((c) => [
      c.fullName,
      c.fullNameKana,
      c.company,
      c.department,
      c.title,
      c.postalCode,
      c.address,
      c.phone,
      c.mobile,
      c.fax,
      c.email,
      c.website,
      c.sns,
      c.note ?? "",
      c.sourceFileId,
    ]),
  );
  return workbook;
}

function buildHandwrittenWorkbook(
  analysis: HandwrittenImageAnalysis,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  writeKeyValueSheet(workbook, "文字起こし", [
    ["原文", analysis.fields.transcript],
    ["整理版", analysis.fields.cleanedText],
    ["要確認箇所", analysis.fields.unclearSpans.join(" / ")],
  ]);
  if (analysis.rows.length > 0) {
    const sheet = workbook.addWorksheet(sanitizeSheetName("ToDo"));
    writeMatrix(
      sheet,
      ["内容", "担当者", "期限", "優先度", "備考"],
      analysis.rows.map((row) => [
        row.title,
        row.assignee,
        row.dueDate,
        row.priority,
        row.note ?? "",
      ]),
    );
  }
  return workbook;
}

export async function buildWorkbookFromAnalysis(
  analysis: ImageAnalysisResult,
): Promise<ExcelJS.Workbook> {
  switch (analysis.documentType) {
    case "receipt":
      return buildReceiptWorkbook(analysis);
    case "invoice":
    case "estimate":
      return buildInvoiceWorkbook(analysis);
    case "business_card":
      return buildBusinessCardWorkbook(analysis);
    case "handwritten":
      return buildHandwrittenWorkbook(analysis);
    case "table":
      return buildTableWorkbook(analysis);
    default: {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("データ");
      writeMatrix(sheet, ["key", "value"], [["documentType", analysis.documentType]]);
      return workbook;
    }
  }
}

export async function analysisToXlsxBuffer(
  analysis: ImageAnalysisResult,
): Promise<Buffer> {
  const workbook = await buildWorkbookFromAnalysis(analysis);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function analysisToCsv(analysis: ImageAnalysisResult): string {
  const escape = (value: unknown): string => {
    const text = value == null ? "" : String(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  let headers: string[] = [];
  let rows: unknown[][] = [];

  if (analysis.documentType === "table") {
    headers = analysis.fields.columns;
    rows = analysis.rows.map((row) => headers.map((h) => row[h] ?? ""));
  } else if (analysis.documentType === "business_card") {
    headers = [
      "氏名",
      "会社名",
      "部署名",
      "役職",
      "電話番号",
      "携帯電話番号",
      "メールアドレス",
      "Webサイト",
    ];
    const contacts = analysis.fields.contacts ?? analysis.rows;
    rows = contacts.map((c) => [
      c.fullName,
      c.company,
      c.department,
      c.title,
      c.phone,
      c.mobile,
      c.email,
      c.website,
    ]);
  } else if (analysis.documentType === "receipt") {
    headers = ["商品名", "数量", "単価", "小計", "カテゴリ"];
    rows = analysis.rows.map((row) => [
      row.name,
      row.quantity,
      row.unitPrice,
      row.subtotal,
      row.category,
    ]);
  } else if (
    analysis.documentType === "invoice" ||
    analysis.documentType === "estimate"
  ) {
    headers = ["品名", "数量", "単価", "金額"];
    rows = analysis.rows.map((row) => [
      row.name,
      row.quantity,
      row.unitPrice,
      row.amount,
    ]);
  } else if (analysis.documentType === "handwritten") {
    headers = ["内容", "担当者", "期限", "優先度"];
    rows = analysis.rows.map((row) => [
      row.title,
      row.assignee,
      row.dueDate,
      row.priority,
    ]);
  }

  if (headers.length === 0) {
    headers = ["title", "documentType"];
    rows = [[analysis.title, analysis.documentType]];
  }

  const lines = [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function suggestAnalysisFileBaseName(analysis: ImageAnalysisResult): string {
  switch (analysis.documentType) {
    case "receipt":
      return "kakeibo";
    case "invoice":
      return "invoice";
    case "estimate":
      return "estimate";
    case "business_card":
      return "contacts";
    case "handwritten":
      return "handwritten_memo";
    case "table":
      return "table";
    default:
      return "image_analysis";
  }
}
