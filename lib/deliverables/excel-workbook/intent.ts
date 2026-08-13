/**
 * Decide formulas / extra sheets / charts from the request + table shape.
 * Never attach a chart "just because" a number column exists.
 */

export type ExcelIntent = {
  formulas: boolean;
  monthlySheet: boolean;
  categorySheet: boolean;
  chart: boolean;
  kind: "roster" | "ledger" | "sales" | "generic" | "empty";
};

function haystack(parts: string[]): string {
  return parts.filter(Boolean).join("\n");
}

export function resolveExcelIntent(input: {
  assignment?: string | null;
  sheetNames: string[];
  headers: string[][];
  rowCounts: number[];
}): ExcelIntent {
  const text = haystack([
    input.assignment ?? "",
    ...input.sheetNames,
    ...input.headers.map((h) => h.join(" ")),
  ]);

  const rowCount = input.rowCounts.reduce((a, b) => a + b, 0);
  if (rowCount === 0) {
    return {
      formulas: false,
      monthlySheet: false,
      categorySheet: false,
      chart: false,
      kind: "empty",
    };
  }

  const isRoster =
    /名簿|顧客一覧|連絡先|tel|電話帳/i.test(text) &&
    !/売上|家計|経費|集計/i.test(text);
  const isLedger = /家計簿|レシート|領収|経費精算|支出/i.test(text);
  const isSales = /売上|案件管理|営業リスト|受注/i.test(text);

  const wantsFormula =
    !isRoster &&
    (/集計|合計|合計行|月別|カテゴリ別|平均|件数|SUM|AVERAGE|COUNT|家計簿|売上/i.test(
      text,
    ) ||
      isLedger ||
      isSales);

  const hasDate = input.headers.some((h) =>
    h.some((col) => /日付|date|年月日/i.test(col)),
  );
  const hasCategory = input.headers.some((h) =>
    h.some((col) => /カテゴリ|分類|店名|部門|channel/i.test(col)),
  );
  const hasAmount = input.headers.some((h) =>
    h.some((col) => /金額|売上|支出|amount|revenue/i.test(col)),
  );

  const chartExplicit = /グラフ|チャート|推移|可視化|構成比|chart|pie|bar/i.test(
    text,
  );
  const chartFromDomain =
    (isLedger || isSales || /月別売上|カテゴリ別/i.test(text)) && hasAmount;

  return {
    formulas: wantsFormula && hasAmount,
    monthlySheet: wantsFormula && hasDate && hasAmount,
    categorySheet: wantsFormula && hasCategory && hasAmount,
    chart: (chartExplicit || chartFromDomain) && hasAmount && !isRoster,
    kind: isRoster ? "roster" : isLedger ? "ledger" : isSales ? "sales" : "generic",
  };
}
