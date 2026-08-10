# 【ATLAS機能評価】P3-03 高度なExcel（ピボット/グラフ）

機能名：高度なExcel（ピボット/グラフ）（P3-03）

ユーザー価値：表データからカテゴリ別のピボット集計と埋め込みグラフが最初から入った .xlsx が届き、Excel 上で手作業の集計・グラフ作成を繰り返さなくてよい。

差別化：`includeChart` / `structureDefaults.charts` / 「グラフ用データ」シート名だけの宣言ではなく、OOXML `xl/charts` + `xl/drawings` とピボット集計シートを実バイナリに書き込む。

繰り返し作業の削減：はい — ピボット作成・グラフ挿入の習慣作業を削減

AI必要度：不要 — 集計・チャートは決定論的プログラム

AIなしで実装可能：はい

運営コスト：低（生成時の ZIP 注入のみ、追加外部 API なし）

外部APIコスト：無

コスト削減案：

- [x] エコモード — AI不使用
- [x] まとめて生成 — 1 回の xlsx 生成に集計+グラフ同梱
- [x] キャッシュ再利用 — 同一入力は同一バイナリ構造（決定論）
- [x] 予約実行 — Automation excel_generate / health verify
- [x] AI起動条件 — AIなし
- [x] 外部API最小化 — なし
- [x] 承認後実行 — 成果物生成フローに内包
- [x] 再生成禁止 — 同一 content で冪等な構造（chart/pivot 再発明しない）

優先度：P3（47/100 評価の将来項目 #22）

## 正式出典（推測禁止）

47/100 超辛口レビュー / 優先度分類:

- P3（将来）20 = JWT連携RLS（P3-01 COMPLETE）
- P3（将来）21 = Company templateのテナント分離徹底（P3-02 COMPLETE）
- P3（将来）22 = **高度なExcel（ピボット/グラフ）**（本 P3-03）
- P3（将来）23 = PPTデザインテンプレ本格化 — **着手禁止（P3-04）**

## 開始時点の問題

- exceljs で表・numFmt・autoFilter までは実装済み（P1-08）
- Automation UI の `includeChart` / artifact `structureDefaults.charts` は宣言のみで generator 未接続
- 家計簿の「グラフ用データ」シートはデータのみで chart part なし
- ピボット集計シートもなし → お客様が Excel で毎回手作業

## Acceptance Criteria

1. カテゴリ+数値テーブルから `ピボット集計` シートが生成される
2. 生成 xlsx に `xl/charts/chart*.xml` と `xl/drawings/drawing*.xml` が存在する
3. `includeChart: false` でグラフ注入を止められる（fail-closed / 明示オプトアウト）
4. Automation `excel_generate` の `includeChart` が generator まで届く
5. Production `/api/health/excel-advanced` が同一 SHA で全 AC true
6. P0〜P2 / P3-01 / P3-02 を壊さない。P3-04 に着手しない
