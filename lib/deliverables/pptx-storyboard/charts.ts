/**
 * Native pptxgen charts from source tables only.
 * Never invent numbers. Skip chart when a table is the better fit.
 */

export type PptxChartKind = "bar" | "column" | "line" | "pie";

export type PptxChartSpec = {
  kind: PptxChartKind;
  title: string;
  categories: string[];
  values: number[];
};

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,，\s¥￥円%％]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function looksPercent(raw: string): boolean {
  return /[%％]$/.test(raw.trim());
}

export function tableToChartSpec(input: {
  title: string;
  headers: string[];
  rows: string[][];
}): PptxChartSpec | null {
  if (input.rows.length < 2 || input.rows.length > 8) return null;
  if (input.headers.length < 2) return null;

  let valueCol = input.headers.findIndex((h) =>
    /金額|売上|件数|数量|構成|割合|%|％|値|実績/i.test(h),
  );
  if (valueCol < 0) {
    for (let col = 1; col < input.headers.length; col += 1) {
      const numeric = input.rows.filter((row) => parseNumber(row[col] ?? "") != null)
        .length;
      if (numeric >= Math.ceil(input.rows.length * 0.7)) {
        valueCol = col;
        break;
      }
    }
  }
  if (valueCol < 0) return null;

  const categoryCol = input.headers.findIndex((_h, idx) => idx !== valueCol);
  if (categoryCol < 0) return null;

  const categories: string[] = [];
  const values: number[] = [];
  for (const row of input.rows) {
    const label = String(row[categoryCol] ?? "").trim();
    const num = parseNumber(String(row[valueCol] ?? ""));
    if (!label || num == null) continue;
    categories.push(label);
    values.push(num);
  }
  if (categories.length < 2) return null;

  const headerHay = `${input.title} ${input.headers.join(" ")}`;
  const percentHeavy = input.rows.filter((row) =>
    looksPercent(String(row[valueCol] ?? "")),
  ).length;
  let kind: PptxChartKind = "column";
  if (/推移|月次|年次|トレンド|時系列/i.test(headerHay)) kind = "line";
  else if (
    (/構成|内訳|シェア|割合/i.test(headerHay) || percentHeavy >= categories.length - 1) &&
    categories.length <= 6
  ) {
    kind = "pie";
  } else if (/比較|対比/i.test(headerHay)) {
    kind = "bar";
  }

  return {
    kind,
    title: input.headers[valueCol] || input.title,
    categories,
    values,
  };
}
