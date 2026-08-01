/** Corporate Excel design tokens — Yu Gothic, calm blue header, print-ready. */

export const EXCEL_DESIGN = {
  fontName: "Yu Gothic",
  fontSize: 11,
  headerFill: "FF1F4E79",
  headerFont: "FFFFFFFF",
  altRowFill: "FFF3F6FA",
  totalFill: "FFE8EEF5",
  borderColor: "FFB0B0B0",
  titleFontSize: 16,
  currencyFmt: "¥#,##0",
  numberFmt: "#,##0.###",
  percentFmt: "0.0%",
  dateFmt: "yyyy/mm/dd",
  datetimeFmt: "yyyy/mm/dd hh:mm",
  maxColumnWidth: 48,
  minColumnWidth: 8,
} as const;

export const THIN_BORDER = {
  top: { style: "thin" as const, color: { argb: EXCEL_DESIGN.borderColor } },
  left: { style: "thin" as const, color: { argb: EXCEL_DESIGN.borderColor } },
  bottom: { style: "thin" as const, color: { argb: EXCEL_DESIGN.borderColor } },
  right: { style: "thin" as const, color: { argb: EXCEL_DESIGN.borderColor } },
};

export function numFmtForKind(
  kind: import("./types").ExcelCellKind,
): string | undefined {
  switch (kind) {
    case "currency":
      return EXCEL_DESIGN.currencyFmt;
    case "number":
      return EXCEL_DESIGN.numberFmt;
    case "percent":
      return EXCEL_DESIGN.percentFmt;
    case "date":
      return EXCEL_DESIGN.dateFmt;
    case "datetime":
      return EXCEL_DESIGN.datetimeFmt;
    default:
      return undefined;
  }
}

/** Display width for JP/ASCII mixed text. */
export function cellDisplayWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    width += char.charCodeAt(0) > 255 ? 2 : 1;
  }
  return width;
}
