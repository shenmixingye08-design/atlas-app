import ExcelJS from "exceljs";

import type { DocumentModel } from "@/lib/documents/schema/document-model.zod";
import { DESIGN_TOKENS } from "@/lib/documents/tokens/design-tokens";
import { sanitizeExcelCell, sanitizeExcelRow } from "./sanitize-cell";

function collectTables(model: DocumentModel) {
  const tables: { title: string; headers: string[]; rows: string[][] }[] = [];
  for (const section of model.sections) {
    for (const block of section.blocks) {
      if (block.type === "table") {
        tables.push({
          title: section.heading,
          headers: block.headers,
          rows: block.rows,
        });
      }
    }
  }
  return tables;
}

/** Render DocumentModel to real .xlsx via exceljs. */
export async function renderDocumentModelToXlsx(
  model: DocumentModel,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Atlas";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("概要", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  summarySheet.columns = [
    { header: "項目", key: "key", width: 20 },
    { header: "内容", key: "value", width: 60 },
  ];
  summarySheet.addRow({ key: "タイトル", value: sanitizeExcelCell(model.title) });
  if (model.subtitle) {
    summarySheet.addRow({ key: "副題", value: sanitizeExcelCell(model.subtitle) });
  }
  if (model.summary) {
    summarySheet.addRow({ key: "概要", value: sanitizeExcelCell(model.summary) });
  }
  summarySheet.addRow({
    key: "種別",
    value: sanitizeExcelCell(model.documentType),
  });
  summarySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  summarySheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E79" },
  };
  summarySheet.autoFilter = { from: "A1", to: "B1" };

  const tables = collectTables(model);

  if (tables.length === 0) {
    const contentSheet = workbook.addWorksheet("内容", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    contentSheet.columns = [
      { header: "見出し", key: "heading", width: 24 },
      { header: "本文", key: "body", width: 80 },
    ];
    contentSheet.getRow(1).font = { bold: true };
    for (const section of model.sections) {
      const bodyParts: string[] = [];
      for (const block of section.blocks) {
        if (block.type === "paragraph") bodyParts.push(block.text);
        if (block.type === "bullets") bodyParts.push(...block.items.map((i) => `• ${i}`));
      }
      contentSheet.addRow({
        heading: sanitizeExcelCell(section.heading),
        body: sanitizeExcelCell(bodyParts.join("\n")),
      });
    }
    contentSheet.autoFilter = { from: "A1", to: "B1" };
  } else {
    const usedNames = new Set<string>();
    tables.forEach((table, index) => {
      const base = table.title.slice(0, 24) || `表${index + 1}`;
      let name = base;
      let suffix = 2;
      while (usedNames.has(name)) {
        name = `${base.slice(0, 20)}_${suffix}`;
        suffix += 1;
      }
      usedNames.add(name);
      const sheet = workbook.addWorksheet(name, {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      const headers = sanitizeExcelRow(table.headers);
      sheet.addRow(headers);
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F4E79" },
      };
      for (const row of table.rows) {
        sheet.addRow(sanitizeExcelRow(row));
      }
      sheet.columns = headers.map((_, colIndex) => ({
        width: Math.min(40, Math.max(12, headers[colIndex]?.length ?? 12)),
      }));
      const colLetter = String.fromCharCode(65 + Math.max(headers.length - 1, 0));
      sheet.autoFilter = { from: "A1", to: `${colLetter}1` };
    });
  }

  if (model.actionItems?.length) {
    const actionSheet = workbook.addWorksheet("アクション", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    actionSheet.columns = [
      { header: "内容", key: "text", width: 50 },
      { header: "担当", key: "assignee", width: 16 },
      { header: "期限", key: "dueDate", width: 14 },
    ];
    actionSheet.getRow(1).font = { bold: true };
    for (const item of model.actionItems) {
      actionSheet.addRow({
        text: sanitizeExcelCell(item.text),
        assignee: sanitizeExcelCell(item.assignee ?? ""),
        dueDate: sanitizeExcelCell(item.dueDate ?? ""),
      });
    }
    actionSheet.autoFilter = { from: "A1", to: "C1" };
  }

  void DESIGN_TOKENS;
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
