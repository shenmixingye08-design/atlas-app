import type {
  ExcelCellModel,
  ExcelColumnModel,
  ExcelSheetModel,
  ExcelWorkbookKind,
  ExcelWorkbookModel,
} from "./types";
import { buildAutoTotalRow, tableOrigin } from "./formulas";

function cols(
  defs: Array<[string, string, ExcelColumnModel["kind"]]>,
): ExcelColumnModel[] {
  return defs.map(([key, header, kind]) => ({ key, header, kind }));
}

function sampleRows(
  columns: ExcelColumnModel[],
  raw: Array<Array<string | number>>,
): ExcelCellModel[][] {
  return raw.map((row) =>
    columns.map((column, index) => ({
      value: row[index] ?? "",
      kind: column.kind,
    })),
  );
}

function withTotals(sheet: ExcelSheetModel): ExcelSheetModel {
  const origin = tableOrigin(Boolean(sheet.title));
  const lastDataRow = origin.firstDataRow + sheet.rows.length - 1;
  if (sheet.rows.length === 0) return sheet;
  const total = buildAutoTotalRow({
    columns: sheet.columns,
    firstDataRow: origin.firstDataRow,
    lastDataRow,
  });
  return { ...sheet, rows: [...sheet.rows, total] };
}

const TEMPLATE_BUILDERS: Record<
  ExcelWorkbookKind,
  (title: string) => ExcelWorkbookModel
> = {
  sales: (title) => {
    const columns = cols([
      ["date", "日付", "date"],
      ["product", "商品名", "text"],
      ["customer", "顧客", "text"],
      ["qty", "数量", "number"],
      ["unitPrice", "単価", "currency"],
      ["amount", "売上金額", "currency"],
      ["channel", "チャネル", "text"],
    ]);
    const rows = sampleRows(columns, [
      ["2026-07-01", "スタンダードプラン", "株式会社サンプル", 2, 50000, 100000, "直販"],
      ["2026-07-05", "プロプラン", "合同会社テスト", 1, 120000, 120000, "代理店"],
      ["2026-07-12", "追加ライセンス", "株式会社サンプル", 5, 8000, 40000, "直販"],
    ]);
    const detail = withTotals({
      name: "売上明細",
      title,
      columns,
      rows,
      asTable: true,
      freezeHeader: true,
      tableName: "SalesTable",
      charts: [
        {
          type: "column",
          title: "売上金額",
          categoriesRange: "B3:B5",
          series: [{ name: "売上", valuesRange: "F3:F5" }],
          anchor: "I2",
        },
      ],
    });
    return { kind: "sales", title, sheets: [detail] };
  },

  household: (title) => {
    const columns = cols([
      ["date", "日付", "date"],
      ["category", "分類", "text"],
      ["store", "店名", "text"],
      ["content", "内容", "text"],
      ["amount", "金額", "currency"],
      ["method", "支払方法", "text"],
    ]);
    const rows = sampleRows(columns, [
      ["2026-07-01", "食費", "スーパーA", "食料品", 3280, "現金"],
      ["2026-07-02", "交通", "交通系IC", "通勤", 540, "交通系IC"],
      ["2026-07-03", "日用品", "ドラッグストア", "洗剤", 980, "カード"],
    ]);
    return {
      kind: "household",
      title,
      sheets: [
        withTotals({
          name: "家計簿",
          title,
          columns,
          rows,
          asTable: true,
          freezeHeader: true,
          tableName: "HouseholdTable",
        }),
      ],
    };
  },

  process: (title) => ganttLike(title, "process"),
  gantt: (title) => ganttLike(title, "gantt"),

  attendance: (title) => {
    const columns = cols([
      ["date", "日付", "date"],
      ["name", "氏名", "text"],
      ["shift", "シフト", "text"],
      ["start", "開始", "text"],
      ["end", "終了", "text"],
      ["hours", "勤務時間", "number"],
      ["notes", "備考", "text"],
    ]);
    const rows = sampleRows(columns, [
      ["2026-08-01", "山田太郎", "早番", "09:00", "18:00", 8, ""],
      ["2026-08-01", "佐藤花子", "遅番", "13:00", "22:00", 8, ""],
    ]);
    return {
      kind: "attendance",
      title,
      sheets: [
        {
          name: "勤務表",
          title,
          columns,
          rows,
          asTable: true,
          freezeHeader: true,
        },
      ],
    };
  },

  timecard: (title) => {
    const columns = cols([
      ["date", "日付", "date"],
      ["name", "氏名", "text"],
      ["in", "出勤", "text"],
      ["out", "退勤", "text"],
      ["breakMin", "休憩(分)", "number"],
      ["workHours", "実働", "number"],
      ["overtime", "残業", "number"],
    ]);
    const rows = sampleRows(columns, [
      ["2026-08-01", "山田太郎", "09:00", "19:00", 60, 9, 1],
    ]);
    return {
      kind: "timecard",
      title,
      sheets: [
        withTotals({
          name: "勤怠",
          title,
          columns,
          rows,
          asTable: true,
          freezeHeader: true,
        }),
      ],
    };
  },

  customers: (title) => {
    const columns = cols([
      ["name", "氏名", "text"],
      ["company", "会社名", "text"],
      ["phone", "電話", "text"],
      ["email", "メール", "text"],
      ["address", "住所", "text"],
      ["lastContact", "最終連絡日", "date"],
      ["notes", "備考", "text"],
    ]);
    const rows = sampleRows(columns, [
      ["山田太郎", "株式会社サンプル", "03-1234-5678", "taro@example.com", "東京都", "2026-07-20", "優先度高"],
    ]);
    return {
      kind: "customers",
      title,
      sheets: [{ name: "顧客一覧", title, columns, rows, asTable: true, freezeHeader: true }],
    };
  },

  inventory: (title) => {
    const columns = cols([
      ["sku", "品番", "text"],
      ["name", "品名", "text"],
      ["qty", "在庫数", "number"],
      ["safety", "安全在庫", "number"],
      ["unitCost", "原価", "currency"],
      ["value", "在庫金額", "currency"],
      ["location", "保管場所", "text"],
    ]);
    const rows = sampleRows(columns, [
      ["A-001", "トナー", 12, 5, 3200, 38400, "倉庫A"],
      ["B-014", "用紙A4", 40, 20, 450, 18000, "倉庫B"],
    ]);
    // value column uses formula per row in builder enhancement — keep values for sample
    return {
      kind: "inventory",
      title,
      sheets: [
        withTotals({
          name: "在庫",
          title,
          columns,
          rows,
          asTable: true,
          freezeHeader: true,
        }),
      ],
    };
  },

  estimate: (title) => lineItemDoc(title, "estimate", "見積明細"),
  invoice: (title) => lineItemDoc(title, "invoice", "請求明細"),
  receipt: (title) => {
    const columns = cols([
      ["date", "日付", "date"],
      ["payee", "宛名", "text"],
      ["description", "但し書き", "text"],
      ["amount", "金額", "currency"],
      ["tax", "税額", "currency"],
      ["issuer", "発行者", "text"],
    ]);
    const rows = sampleRows(columns, [
      ["2026-07-15", "株式会社サンプル 御中", "コンサルティング代金として", 110000, 10000, "MINERVOT"],
    ]);
    return {
      kind: "receipt",
      title,
      sheets: [
        withTotals({
          name: "領収一覧",
          title,
          columns,
          rows,
          asTable: true,
          freezeHeader: true,
        }),
      ],
    };
  },

  schedule: (title) => {
    const columns = cols([
      ["date", "日付", "date"],
      ["time", "時間", "text"],
      ["title", "内容", "text"],
      ["place", "場所", "text"],
      ["owner", "担当", "text"],
      ["notes", "備考", "text"],
    ]);
    const rows = sampleRows(columns, [
      ["2026-08-03", "10:00", "キックオフ", "会議室A", "山田", ""],
      ["2026-08-05", "14:00", "レビュー", "オンライン", "佐藤", ""],
    ]);
    return {
      kind: "schedule",
      title,
      sheets: [{ name: "スケジュール", title, columns, rows, asTable: true, freezeHeader: true }],
    };
  },

  generic_table: (title) => ({
    kind: "generic_table",
    title,
    sheets: [
      {
        name: "データ",
        title,
        columns: cols([
          ["item", "項目", "text"],
          ["value", "値", "text"],
          ["notes", "備考", "text"],
        ]),
        rows: sampleRows(
          cols([
            ["item", "項目", "text"],
            ["value", "値", "text"],
            ["notes", "備考", "text"],
          ]),
          [
            ["項目1", "内容1", ""],
            ["項目2", "内容2", ""],
          ],
        ),
        asTable: true,
        freezeHeader: true,
      },
    ],
  }),

  sales_pipeline: (title) => {
    const columns = cols([
      ["name", "案件名", "text"],
      ["customer", "顧客", "text"],
      ["stage", "ステージ", "text"],
      ["amount", "見込金額", "currency"],
      ["prob", "確度", "percent"],
      ["owner", "担当", "text"],
      ["close", "予定日", "date"],
      ["notes", "備考", "text"],
    ]);
    const rows = sampleRows(columns, [
      ["A社刷新", "株式会社A", "提案", 3000000, 0.4, "山田", "2026-09-30", ""],
      ["B社追加", "B商事", "交渉", 1200000, 0.7, "佐藤", "2026-08-31", ""],
    ]);
    return {
      kind: "sales_pipeline",
      title,
      purpose: "営業案件の進捗管理",
      locale: "ja-JP",
      sheets: [
        withTotals({
          name: "案件一覧",
          title,
          columns,
          rows,
          asTable: true,
          freezeHeader: true,
          charts: [
            {
              type: "column",
              title: "見込金額",
              categoriesRange: "A3:A4",
              series: [{ name: "見込", valuesRange: "D3:D4" }],
              anchor: "J2",
            },
          ],
        }),
      ],
    };
  },

  shift: (title) => {
    const columns = cols([
      ["name", "氏名", "text"],
      ["mon", "月", "text"],
      ["tue", "火", "text"],
      ["wed", "水", "text"],
      ["thu", "木", "text"],
      ["fri", "金", "text"],
      ["sat", "土", "text"],
      ["sun", "日", "text"],
      ["hours", "週合計時間", "number"],
    ]);
    const rows = sampleRows(columns, [
      ["山田", "早番", "早番", "公休", "遅番", "遅番", "公休", "公休", 32],
      ["佐藤", "遅番", "遅番", "早番", "早番", "公休", "早番", "公休", 40],
    ]);
    return {
      kind: "shift",
      title,
      sheets: [
        {
          name: "シフト",
          title,
          columns,
          rows,
          asTable: true,
          freezeHeader: true,
          printLandscape: true,
        },
        {
          name: "使い方",
          columns: cols([
            ["q", "項目", "text"],
            ["a", "説明", "text"],
          ]),
          rows: sampleRows(
            cols([
              ["q", "項目", "text"],
              ["a", "説明", "text"],
            ]),
            [
              ["入力", "早番/遅番/公休を入力してください"],
              ["集計", "週合計時間は手入力またはSUMで集計できます"],
            ],
          ),
          asTable: true,
          freezeHeader: true,
        },
      ],
    };
  },

  vehicle: (title) => {
    const columns = cols([
      ["plate", "車両番号", "text"],
      ["model", "車種", "text"],
      ["user", "使用者", "text"],
      ["inspect", "車検期限", "date"],
      ["insurance", "保険期限", "date"],
      ["mileage", "走行距離", "number"],
      ["notes", "備考", "text"],
    ]);
    const rows = sampleRows(columns, [
      ["品川300あ1234", "ハイエース", "山田", "2027-03-01", "2026-12-31", 45200, ""],
    ]);
    return {
      kind: "vehicle",
      title,
      sheets: [{ name: "車両一覧", title, columns, rows, asTable: true, freezeHeader: true }],
    };
  },

  daily_report: (title) => {
    const columns = cols([
      ["date", "日付", "date"],
      ["name", "氏名", "text"],
      ["work", "業務内容", "text"],
      ["result", "成果", "text"],
      ["issue", "課題", "text"],
      ["next", "明日の予定", "text"],
      ["hours", "稼働時間", "number"],
    ]);
    const rows = sampleRows(columns, [
      ["2026-08-01", "山田", "顧客ヒアリング", "要件整理完了", "見積待ち", "提案資料作成", 8],
    ]);
    return {
      kind: "daily_report",
      title,
      sheets: [{ name: "日報", title, columns, rows, asTable: true, freezeHeader: true }],
    };
  },

  invoice_list: (title) => {
    const columns = cols([
      ["no", "請求番号", "text"],
      ["customer", "請求先", "text"],
      ["date", "請求日", "date"],
      ["due", "支払期限", "date"],
      ["amount", "請求額", "currency"],
      ["status", "状態", "text"],
      ["notes", "備考", "text"],
    ]);
    const rows = sampleRows(columns, [
      ["INV-001", "株式会社A", "2026-07-31", "2026-08-31", 563200, "未入金", ""],
      ["INV-002", "B商事", "2026-07-15", "2026-08-15", 220000, "入金済", ""],
    ]);
    return {
      kind: "invoice_list",
      title,
      sheets: [
        withTotals({
          name: "請求一覧",
          title,
          columns,
          rows,
          asTable: true,
          freezeHeader: true,
        }),
      ],
    };
  },

  cashflow: (title) => {
    const columns = cols([
      ["date", "日付", "date"],
      ["category", "区分", "text"],
      ["item", "項目", "text"],
      ["income", "収入", "currency"],
      ["expense", "支出", "currency"],
      ["balance", "残高", "currency"],
      ["notes", "備考", "text"],
    ]);
    const rows = sampleRows(columns, [
      ["2026-08-01", "売上", "受注入金", 500000, 0, 500000, ""],
      ["2026-08-02", "経費", "交通費", 0, 12000, 488000, ""],
    ]);
    return {
      kind: "cashflow",
      title,
      sheets: [
        withTotals({
          name: "収支",
          title,
          columns,
          rows,
          asTable: true,
          freezeHeader: true,
          charts: [
            {
              type: "line",
              title: "残高推移",
              categoriesRange: "A3:A4",
              series: [{ name: "残高", valuesRange: "F3:F4" }],
              anchor: "I2",
            },
          ],
        }),
      ],
    };
  },

  survey: (title) => {
    const columns = cols([
      ["id", "回答ID", "text"],
      ["q1", "設問1", "text"],
      ["q2", "設問2", "number"],
      ["q3", "設問3", "text"],
      ["submitted", "回答日", "date"],
    ]);
    const rows = sampleRows(columns, [
      ["R001", "はい", 5, "改善してほしい", "2026-08-01"],
      ["R002", "いいえ", 3, "現状で良い", "2026-08-01"],
    ]);
    return {
      kind: "survey",
      title,
      sheets: [{ name: "回答", title, columns, rows, asTable: true, freezeHeader: true }],
    };
  },

  tasks: (title) => {
    const columns = cols([
      ["task", "タスク", "text"],
      ["owner", "担当", "text"],
      ["status", "状態", "text"],
      ["priority", "優先度", "text"],
      ["due", "期限", "date"],
      ["notes", "備考", "text"],
    ]);
    const rows = sampleRows(columns, [
      ["提案資料作成", "山田", "進行中", "高", "2026-08-05", ""],
      ["見積確認", "佐藤", "未着手", "中", "2026-08-07", ""],
    ]);
    return {
      kind: "tasks",
      title,
      sheets: [{ name: "タスク", title, columns, rows, asTable: true, freezeHeader: true }],
    };
  },

  realestate: (title) => {
    const columns = cols([
      ["property", "物件名", "text"],
      ["address", "住所", "text"],
      ["type", "種別", "text"],
      ["rent", "賃料", "currency"],
      ["status", "状態", "text"],
      ["tenant", "入居者", "text"],
      ["renew", "更新日", "date"],
      ["notes", "備考", "text"],
    ]);
    const rows = sampleRows(columns, [
      ["メゾン青葉101", "東京都世田谷区", "マンション", 120000, "契約中", "田中", "2027-03-31", ""],
    ]);
    return {
      kind: "realestate",
      title,
      sheets: [{ name: "物件一覧", title, columns, rows, asTable: true, freezeHeader: true }],
    };
  },

  solar: (title) => {
    const columns = cols([
      ["site", "案件名", "text"],
      ["kw", "容量kW", "number"],
      ["status", "進捗", "text"],
      ["epc", "EPC", "text"],
      ["cod", "連系予定", "date"],
      ["capex", "投資額", "currency"],
      ["notes", "備考", "text"],
    ]);
    const rows = sampleRows(columns, [
      ["千葉A発電所", 500, "設計", "〇〇建設", "2026-12-01", 80000000, ""],
    ]);
    return {
      kind: "solar",
      title,
      sheets: [
        withTotals({
          name: "案件管理",
          title,
          columns,
          rows,
          asTable: true,
          freezeHeader: true,
        }),
      ],
    };
  },

  from_image: (title) => TEMPLATE_BUILDERS.generic_table(title),
  from_pdf: (title) => TEMPLATE_BUILDERS.generic_table(title),
  from_word: (title) => TEMPLATE_BUILDERS.generic_table(title),
  from_csv: (title) => TEMPLATE_BUILDERS.generic_table(title),
  edited: (title) => TEMPLATE_BUILDERS.generic_table(title),
  analysis: (title) => TEMPLATE_BUILDERS.generic_table(title),
};

function lineItemDoc(
  title: string,
  kind: "estimate" | "invoice",
  sheetName: string,
): ExcelWorkbookModel {
  const columns = cols([
    ["item", "項目", "text"],
    ["qty", "数量", "number"],
    ["unit", "単位", "text"],
    ["unitPrice", "単価", "currency"],
    ["amount", "金額", "currency"],
    ["notes", "備考", "text"],
  ]);
  const rows = sampleRows(columns, [
    ["要件定義", 1, "式", 100000, 100000, ""],
    ["設計", 1, "式", 80000, 80000, ""],
    ["実装支援", 10, "人日", 50000, 500000, ""],
  ]);
  return {
    kind,
    title,
    sheets: [
      withTotals({
        name: sheetName,
        title,
        columns,
        rows,
        asTable: true,
        freezeHeader: true,
        tableName: kind === "invoice" ? "InvoiceTable" : "EstimateTable",
      }),
    ],
  };
}

function ganttLike(title: string, kind: "gantt" | "process"): ExcelWorkbookModel {
  const columns = cols([
    ["task", "タスク", "text"],
    ["owner", "担当", "text"],
    ["start", "開始日", "date"],
    ["end", "終了日", "date"],
    ["days", "日数", "number"],
    ["progress", "進捗", "percent"],
    ["w1", "W1", "text"],
    ["w2", "W2", "text"],
    ["w3", "W3", "text"],
    ["w4", "W4", "text"],
  ]);
  const rows = sampleRows(columns, [
    ["要件定義", "山田", "2026-08-01", "2026-08-07", 5, 1, "■", "■", "", ""],
    ["設計", "佐藤", "2026-08-08", "2026-08-14", 5, 0.4, "", "■", "■", ""],
    ["実装", "鈴木", "2026-08-15", "2026-08-28", 10, 0.1, "", "", "■", "■"],
  ]);
  // days as NETWORKDAYS formula will be applied in enrichSheetFormulas
  return {
    kind,
    title,
    sheets: [
      {
        name: "工程表",
        title,
        columns,
        rows,
        asTable: true,
        freezeHeader: true,
        printLandscape: true,
      },
    ],
  };
}

export function buildTemplateWorkbook(
  kind: ExcelWorkbookKind,
  title?: string,
): ExcelWorkbookModel {
  const builder = TEMPLATE_BUILDERS[kind] ?? TEMPLATE_BUILDERS.generic_table;
  return builder(title?.trim() || "業務表");
}
