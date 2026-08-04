import { parseDeliverableContent } from "@/lib/deliverables/parse-content";
import {
  contentHasMarkdownTable,
  extractExcelSheets,
  type ExcelSheetData,
} from "@/lib/deliverables/excel-data";

import type { ArtifactType } from "./types";

export type ExcelColumnKind = "text" | "number" | "currency" | "date";

export type ExcelColumnSchema = {
  key: string;
  header: string;
  kind: ExcelColumnKind;
  aliases: string[];
};

export type ExcelSchema = {
  id: string;
  title: string;
  columns: ExcelColumnSchema[];
  includeTotalRow?: boolean;
  totalColumnKey?: string;
};

const SCHEMAS: Record<string, ExcelSchema> = {
  ranking: {
    id: "ranking",
    title: "ランキング",
    columns: [
      { key: "rank", header: "順位", kind: "number", aliases: ["順位", "ランク", "rank", "#"] },
      { key: "name", header: "項目名", kind: "text", aliases: ["項目", "項目名", "名称", "名前", "遊び", "商品"] },
      { key: "description", header: "説明", kind: "text", aliases: ["説明", "概要", "理由"] },
      { key: "target", header: "対象", kind: "text", aliases: ["対象", "対象年齢", "ターゲット"] },
      { key: "needs", header: "必要なもの", kind: "text", aliases: ["必要なもの", "必要", "道具"] },
      { key: "notes", header: "補足", kind: "text", aliases: ["補足", "備考", "メモ"] },
    ],
  },
  estimate: {
    id: "estimate",
    title: "見積明細",
    columns: [
      { key: "item", header: "項目", kind: "text", aliases: ["項目", "品目", "内容"] },
      { key: "qty", header: "数量", kind: "number", aliases: ["数量", "qty", "数"] },
      { key: "unit", header: "単位", kind: "text", aliases: ["単位"] },
      { key: "unitPrice", header: "単価", kind: "currency", aliases: ["単価", "価格"] },
      { key: "amount", header: "金額", kind: "currency", aliases: ["金額", "小計"] },
      { key: "notes", header: "備考", kind: "text", aliases: ["備考", "補足"] },
    ],
    includeTotalRow: true,
    totalColumnKey: "amount",
  },
  invoice: {
    id: "invoice",
    title: "請求明細",
    columns: [
      { key: "item", header: "項目", kind: "text", aliases: ["項目", "品目", "内容"] },
      { key: "qty", header: "数量", kind: "number", aliases: ["数量"] },
      { key: "unit", header: "単位", kind: "text", aliases: ["単位"] },
      { key: "unitPrice", header: "単価", kind: "currency", aliases: ["単価"] },
      { key: "amount", header: "金額", kind: "currency", aliases: ["金額", "税抜", "税込"] },
      { key: "notes", header: "備考", kind: "text", aliases: ["備考"] },
    ],
    includeTotalRow: true,
    totalColumnKey: "amount",
  },
  household: {
    id: "household",
    title: "家計簿",
    columns: [
      { key: "date", header: "日付", kind: "date", aliases: ["日付", "日"] },
      { key: "category", header: "分類", kind: "text", aliases: ["分類", "カテゴリ"] },
      { key: "store", header: "店名", kind: "text", aliases: ["店名", "店舗"] },
      { key: "content", header: "内容", kind: "text", aliases: ["内容", "摘要"] },
      { key: "amount", header: "金額", kind: "currency", aliases: ["金額"] },
      { key: "method", header: "支払方法", kind: "text", aliases: ["支払方法", "支払い", "決済"] },
    ],
    includeTotalRow: true,
    totalColumnKey: "amount",
  },
  customers: {
    id: "customers",
    title: "顧客一覧",
    columns: [
      { key: "name", header: "氏名", kind: "text", aliases: ["氏名", "名前", "担当"] },
      { key: "company", header: "会社名", kind: "text", aliases: ["会社名", "会社", "組織"] },
      { key: "phone", header: "電話", kind: "text", aliases: ["電話", "TEL", "携帯"] },
      { key: "email", header: "メール", kind: "text", aliases: ["メール", "email", "Email"] },
      { key: "address", header: "住所", kind: "text", aliases: ["住所"] },
      { key: "notes", header: "備考", kind: "text", aliases: ["備考", "メモ"] },
    ],
  },
  schedule: {
    id: "schedule",
    title: "スケジュール",
    columns: [
      { key: "date", header: "日付", kind: "date", aliases: ["日付", "日"] },
      { key: "time", header: "時間", kind: "text", aliases: ["時間", "時刻"] },
      { key: "title", header: "内容", kind: "text", aliases: ["内容", "予定", "タイトル"] },
      { key: "place", header: "場所", kind: "text", aliases: ["場所", "会場"] },
      { key: "owner", header: "担当", kind: "text", aliases: ["担当", "責任者"] },
      { key: "notes", header: "備考", kind: "text", aliases: ["備考"] },
    ],
  },
};

export function resolveExcelSchema(artifactType: ArtifactType, assignment: string): ExcelSchema | null {
  if (artifactType === "ranking") return SCHEMAS.ranking!;
  if (artifactType === "invoice") return SCHEMAS.invoice!;
  if (artifactType === "household") return SCHEMAS.household!;
  if (artifactType === "schedule") return SCHEMAS.schedule!;
  if (artifactType === "list" || /顧客一覧|名簿/.test(assignment)) {
    return SCHEMAS.customers!;
  }
  if (/見積/.test(assignment)) return SCHEMAS.estimate!;
  return null;
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function mapHeadersToSchema(
  headers: string[],
  schema: ExcelSchema,
): Array<ExcelColumnSchema | null> {
  return headers.map((header) => {
    const normalized = normalizeHeader(header);
    return (
      schema.columns.find((column) =>
        column.aliases.some(
          (alias) => normalizeHeader(alias) === normalized || normalized.includes(normalizeHeader(alias)),
        ),
      ) ?? null
    );
  });
}

function coerceCell(value: string, kind: ExcelColumnKind): string | number | Date {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (kind === "number" || kind === "currency") {
    const numeric = Number(trimmed.replace(/[,¥￥円\s]/g, ""));
    return Number.isFinite(numeric) ? numeric : trimmed;
  }
  if (kind === "date") {
    const parsed = Date.parse(trimmed.replace(/\./g, "/").replace(/年|月/g, "/").replace(/日/g, ""));
    if (!Number.isNaN(parsed)) return new Date(parsed);
  }
  return trimmed;
}

export type ExcelBuildResult = {
  applicable: boolean;
  reason?: string;
  schema: ExcelSchema | null;
  sheets: ExcelSheetData[];
  columnKinds: ExcelColumnKind[][];
  includeTotalRow: boolean;
  totalColumnIndex: number;
};

/**
 * Decide whether content can become a real spreadsheet and shape sheets.
 */
export function buildExcelPayload(input: {
  artifactType: ArtifactType;
  assignment: string;
  content: string;
}): ExcelBuildResult {
  const schema = resolveExcelSchema(input.artifactType, input.assignment);
  const hasTable = contentHasMarkdownTable(input.content);
  const spreadsheetTypes = new Set([
    "ranking",
    "list",
    "household",
    "schedule",
    "invoice",
  ]);

  if (!hasTable && !spreadsheetTypes.has(input.artifactType)) {
    return {
      applicable: false,
      reason: "この成果物はExcel向けの構造ではありません",
      schema: null,
      sheets: [],
      columnKinds: [],
      includeTotalRow: false,
      totalColumnIndex: -1,
    };
  }

  if (!hasTable && spreadsheetTypes.has(input.artifactType)) {
    // Allow schema-shaped fallback from structured text later via extractExcelSheets
  }

  const rawSheets = extractExcelSheets(input.content);
  if (rawSheets.length === 0 || (rawSheets.length === 1 && rawSheets[0]!.rows.length === 0 && !hasTable)) {
    // Fallback sheet with only 項目/内容 is weak — reject for non spreadsheet types
    if (!spreadsheetTypes.has(input.artifactType)) {
      return {
        applicable: false,
        reason: "この成果物はExcel向けの構造ではありません",
        schema: null,
        sheets: [],
        columnKinds: [],
        includeTotalRow: false,
        totalColumnIndex: -1,
      };
    }
  }

  // Reject pure fallback "項目/内容" for general docs without tables
  if (
    !hasTable &&
    rawSheets.length === 1 &&
    rawSheets[0]?.headers.join(",") === "項目,内容" &&
    !spreadsheetTypes.has(input.artifactType)
  ) {
    return {
      applicable: false,
      reason: "この成果物はExcel向けの構造ではありません",
      schema: null,
      sheets: [],
      columnKinds: [],
      includeTotalRow: false,
      totalColumnIndex: -1,
    };
  }

  if (schema && hasTable) {
    const sheets = rawSheets.map((sheet, index) => {
      const mapping = mapHeadersToSchema(sheet.headers, schema);
      if (mapping.every((item) => item == null)) {
        return {
          name: index === 0 ? schema.title : sheet.name,
          headers: schema.columns.map((column) => column.header),
          rows: sheet.rows.map((row) => {
            // Best-effort positional fill
            return schema.columns.map((_, colIndex) => row[colIndex] ?? "");
          }),
        };
      }

      const headers = schema.columns.map((column) => column.header);
      const rows = sheet.rows.map((row) =>
        schema.columns.map((column) => {
          const sourceIndex = mapping.findIndex((mapped) => mapped?.key === column.key);
          if (sourceIndex >= 0) return row[sourceIndex] ?? "";
          return "";
        }),
      );
      return {
        name: index === 0 ? schema.title : sheet.name,
        headers,
        rows,
      };
    });

    return {
      applicable: true,
      schema,
      sheets,
      columnKinds: sheets.map(() => schema.columns.map((column) => column.kind)),
      includeTotalRow: Boolean(schema.includeTotalRow),
      totalColumnIndex: schema.totalColumnKey
        ? schema.columns.findIndex((column) => column.key === schema.totalColumnKey)
        : -1,
    };
  }

  // No schema — keep extracted tables as-is if they look real
  if (hasTable) {
    return {
      applicable: true,
      schema: null,
      sheets: rawSheets,
      columnKinds: rawSheets.map((sheet) => sheet.headers.map(() => "text" as const)),
      includeTotalRow: false,
      totalColumnIndex: -1,
    };
  }

  // Spreadsheet types without markdown tables: keep structured fallback
  if (spreadsheetTypes.has(input.artifactType)) {
    const parsed = parseDeliverableContent(input.content);
    const sheets = rawSheets.length > 0 ? rawSheets : [{
      name: schema?.title ?? "データ",
      headers: schema?.columns.map((column) => column.header) ?? ["項目", "内容"],
      rows: parsed.sections.flatMap((section) =>
        section.blocks.flatMap((block) => {
          if (block.type === "bulletList" || block.type === "numberedList") {
            return block.items.map((item, index) => {
              if (schema?.id === "ranking") {
                return [String(index + 1), item, "", "", "", ""];
              }
              return [section.title, item];
            });
          }
          return [] as string[][];
        }),
      ),
    }];

    return {
      applicable: sheets.some((sheet) => sheet.rows.length > 0),
      reason: sheets.some((sheet) => sheet.rows.length > 0)
        ? undefined
        : "この成果物はExcel向けの構造ではありません",
      schema,
      sheets,
      columnKinds: sheets.map((sheet) =>
        schema
          ? schema.columns.map((column) => column.kind)
          : sheet.headers.map(() => "text" as const),
      ),
      includeTotalRow: Boolean(schema?.includeTotalRow),
      totalColumnIndex: schema?.totalColumnKey
        ? schema.columns.findIndex((column) => column.key === schema.totalColumnKey)
        : -1,
    };
  }

  return {
    applicable: false,
    reason: "この成果物はExcel向けの構造ではありません",
    schema: null,
    sheets: [],
    columnKinds: [],
    includeTotalRow: false,
    totalColumnIndex: -1,
  };
}

export { coerceCell };
