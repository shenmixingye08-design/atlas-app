export type ExcelProductionCase = {
  id: string;
  category:
    | "売上管理"
    | "顧客管理"
    | "家計簿"
    | "請求一覧"
    | "勤怠"
    | "工程管理"
    | "在庫"
    | "営業管理"
    | "分析"
    | "集計"
    | "画像帳票"
    | "数式"
    | "CSV"
    | "長文"
    | "表中心";
  fileName: string;
  assignment: string;
  content: string;
  expectCharts?: boolean;
  expectFormulas?: boolean;
  expectImageForm?: boolean;
};

function table(headers: string[], rows: string[][]): string {
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const head = `| ${headers.join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

function salesRows(n: number, seed: number): string[][] {
  return Array.from({ length: n }, (_, i) => {
    const d = 1 + ((seed + i) % 28);
    const amount = 1000 + ((seed * 17 + i * 130) % 90000);
    return [
      `2026-07-${String(d).padStart(2, "0")}`,
      `顧客${(i % 12) + 1}`,
      `商品${(i % 8) + 1}`,
      String(1 + (i % 5)),
      String(amount),
      `${10 + (i % 5)}%`,
    ];
  });
}

/** Build ≥100 durable Excel production cases across business categories. */
export function buildExcelProductionCases(): ExcelProductionCase[] {
  const cases: ExcelProductionCase[] = [];

  for (let i = 0; i < 12; i += 1) {
    cases.push({
      id: `sales_${i}`,
      category: "売上管理",
      fileName: `売上管理_${i}`,
      assignment: "売上管理をExcelで作成",
      content: `# 売上管理\n\n${table(
        ["日付", "顧客", "商品", "数量", "金額", "粗利率"],
        salesRows(8 + (i % 5), i),
      )}`,
      expectCharts: true,
      expectFormulas: true,
    });
  }

  for (let i = 0; i < 10; i += 1) {
    cases.push({
      id: `customer_${i}`,
      category: "顧客管理",
      fileName: `顧客管理_${i}`,
      assignment: "顧客一覧をExcelへ",
      content: `# 顧客一覧\n\n${table(
        ["氏名", "会社名", "電話", "メール", "住所", "フラグ"],
        Array.from({ length: 6 }, (_, r) => [
          `山田${r}`,
          `株式会社サンプル${i}`,
          `03-1234-${String(1000 + r).slice(-4)}`,
          `user${r}@example.com`,
          `東京都港区${r}-${i}`,
          r % 2 === 0 ? "有" : "無",
        ]),
      )}`,
    });
  }

  for (let i = 0; i < 10; i += 1) {
    cases.push({
      id: `household_${i}`,
      category: "家計簿",
      fileName: `家計簿_${i}`,
      assignment: "家計簿をExcelにまとめて",
      content: `# 家計簿\n\n${table(
        ["日付", "分類", "店名", "内容", "金額", "支払方法"],
        Array.from({ length: 7 }, (_, r) => [
          `2026-08-${String(1 + r).padStart(2, "0")}`,
          ["食費", "交通", "光熱費", "日用品"][r % 4]!,
          `店${r}`,
          `購入${r}`,
          String(500 + r * 120 + i * 10),
          r % 2 === 0 ? "現金" : "カード",
        ]),
      )}`,
      expectCharts: true,
      expectFormulas: true,
    });
  }

  for (let i = 0; i < 10; i += 1) {
    cases.push({
      id: `invoice_${i}`,
      category: "請求一覧",
      fileName: `請求一覧_${i}`,
      assignment: "請求一覧をExcelで",
      content: `# 請求一覧\n\n${table(
        ["請求日", "取引先", "品目", "数量", "単価", "金額"],
        Array.from({ length: 5 }, (_, r) => [
          `2026-06-${String(5 + r).padStart(2, "0")}`,
          `取引先${r}`,
          `サービス${r}`,
          String(r + 1),
          String(10000 + i * 100),
          String((r + 1) * (10000 + i * 100)),
        ]),
      )}`,
      expectFormulas: true,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    cases.push({
      id: `attendance_${i}`,
      category: "勤怠",
      fileName: `勤怠_${i}`,
      assignment: "勤怠表をExcelで作成",
      content: `# 勤怠\n\n${table(
        ["日付", "氏名", "出勤", "退勤", "休憩", "実働"],
        Array.from({ length: 5 }, (_, r) => [
          `2026-07-${String(1 + r).padStart(2, "0")}`,
          `社員${(r % 3) + 1}`,
          "09:00",
          "18:00",
          "1:00",
          "8",
        ]),
      )}`,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    cases.push({
      id: `process_${i}`,
      category: "工程管理",
      fileName: `工程管理_${i}`,
      assignment: "工程管理表をExcelへ",
      content: `# 工程管理\n\n${table(
        ["工程", "担当", "開始日", "終了日", "進捗", "完了"],
        Array.from({ length: 6 }, (_, r) => [
          `工程${r + 1}`,
          `担当${(r % 4) + 1}`,
          `2026-08-${String(1 + r).padStart(2, "0")}`,
          `2026-08-${String(10 + r).padStart(2, "0")}`,
          `${(r + 1) * 15}%`,
          r > 3 ? "TRUE" : "FALSE",
        ]),
      )}`,
      expectCharts: true,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    cases.push({
      id: `inventory_${i}`,
      category: "在庫",
      fileName: `在庫_${i}`,
      assignment: "在庫一覧をExcelで",
      content: `# 在庫\n\n${table(
        ["SKU", "品名", "在庫", "単価", "金額", "更新日"],
        Array.from({ length: 8 }, (_, r) => [
          `SKU-${i}-${r}`,
          `部品${r}`,
          String(10 + r * 3),
          String(200 + r * 15),
          String((10 + r * 3) * (200 + r * 15)),
          `2026-07-${String(1 + (r % 20)).padStart(2, "0")}`,
        ]),
      )}`,
      expectFormulas: true,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    cases.push({
      id: `sales_mgmt_${i}`,
      category: "営業管理",
      fileName: `営業管理_${i}`,
      assignment: "営業管理をExcelで",
      content: `# 営業管理\n\n## 案件\n\n${table(
        ["案件名", "顧客", "金額", "確度", "次回日"],
        Array.from({ length: 4 }, (_, r) => [
          `案件${r}`,
          `顧客${r}`,
          String(50000 * (r + 1)),
          `${30 + r * 10}%`,
          `2026-09-${String(1 + r).padStart(2, "0")}`,
        ]),
      )}\n\n## 活動\n\n${table(
        ["日付", "内容", "担当"],
        [
          ["2026-08-01", "初回訪問", "佐藤"],
          ["2026-08-03", "見積提出", "佐藤"],
        ],
      )}`,
      expectCharts: true,
      expectFormulas: true,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    cases.push({
      id: `analytics_${i}`,
      category: "分析",
      fileName: `分析_${i}`,
      assignment: "分析用Excelを作成",
      content: `# 分析\n\n${table(
        ["カテゴリ", "金額", "件数", "構成比"],
        [
          ["A", String(12000 + i), "3", "40%"],
          ["B", String(8000 + i), "2", "30%"],
          ["C", String(6000 + i), "5", "20%"],
          ["D", String(3000 + i), "1", "10%"],
        ],
      )}`,
      expectCharts: true,
      expectFormulas: true,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    cases.push({
      id: `aggregate_${i}`,
      category: "集計",
      fileName: `集計_${i}`,
      assignment: "集計表をExcelで",
      content: `# 集計\n\n${table(
        ["部門", "売上", "原価", "粗利"],
        [
          ["営業", String(100000 + i), String(40000), String(60000 + i)],
          ["開発", String(80000 + i), String(50000), String(30000 + i)],
          ["管理", String(20000 + i), String(10000), String(10000 + i)],
        ],
      )}`,
      expectFormulas: true,
      expectCharts: true,
    });
  }

  for (let i = 0; i < 6; i += 1) {
    cases.push({
      id: `image_form_${i}`,
      category: "画像帳票",
      fileName: `画像帳票_${i}`,
      assignment: "レシート画像をExcelにまとめて",
      content: `# 領収書\n\n- 日付: 2026-07-${String(10 + i).padStart(2, "0")}\n- 店舗: スーパー${i}\n- 合計: ${1200 + i * 50}円\n\n${table(
        ["品名", "数量", "単価", "金額"],
        [
          ["牛乳", "1", "220", "220"],
          ["パン", "2", "150", "300"],
          ["野菜", "1", String(400 + i), String(400 + i)],
        ],
      )}`,
      expectImageForm: true,
      expectFormulas: true,
    });
  }

  cases.push({
    id: "formula_catalog",
    category: "数式",
    fileName: "数式検証",
    assignment: "数式検証用Excel",
    content: `# 数式データ\n\n${table(
      ["項目", "金額"],
      [
        ["りんご", "1200"],
        ["みかん", "800"],
        ["ばなな", "600"],
      ],
    )}`,
    expectFormulas: true,
  });

  cases.push({
    id: "csv_roundtrip",
    category: "CSV",
    fileName: "CSV互換",
    assignment: "CSVをExcelへ",
    content: "名前,金額,備考\n佐藤,1500,\"改行\n含む\"\n鈴木,2000,メモ",
  });

  cases.push({
    id: "long_table",
    category: "長文",
    fileName: "長文表",
    assignment: "長い一覧をExcelで",
    content: `# 長文一覧\n\n${table(
      ["No", "内容", "金額"],
      Array.from({ length: 120 }, (_, r) => [
        String(r + 1),
        `詳細テキスト${r}`.repeat(3),
        String(1000 + r),
      ]),
    )}`,
    expectFormulas: true,
  });

  cases.push({
    id: "table_heavy",
    category: "表中心",
    fileName: "表中心",
    assignment: "表中心のExcel",
    content: [
      `# 表A\n\n${table(["A", "B"], [["1", "2"], ["3", "4"]])}`,
      `# 表B\n\n${table(["X", "Y", "Z"], [["a", "10", "0.2"], ["b", "20", "0.3"]])}`,
      `# 表C\n\n${table(["日付", "値"], [["2026-01-01", "100"], ["2026-01-02", "200"]])}`,
    ].join("\n\n"),
    expectCharts: true,
  });

  // Pad to at least 100 with variants
  let pad = 0;
  while (cases.length < 100) {
    cases.push({
      id: `pad_sales_${pad}`,
      category: "売上管理",
      fileName: `売上追加_${pad}`,
      assignment: "売上管理Excel",
      content: `# 売上\n\n${table(
        ["日付", "商品", "金額"],
        salesRows(5, pad + 50).map((r) => [r[0]!, r[2]!, r[4]!]),
      )}`,
      expectFormulas: true,
      expectCharts: true,
    });
    pad += 1;
  }

  return cases;
}
