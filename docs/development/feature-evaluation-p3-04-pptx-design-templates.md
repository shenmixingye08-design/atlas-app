# 【ATLAS機能評価】P3-04 PPTデザインテンプレ本格化

機能名：PPTデザインテンプレ本格化（P3-04）

ユーザー価値：用途に合ったデザインテンプレ（配色・レイアウト・枚数）で PPT が最初から整い、毎回スライドを手直しする習慣を減らす。

差別化：単一 16:9 描画ではなく、テンプレ ID ごとの幾何・配色・OOXML theme accent・Automation `theme`/`slideCountHint` が実バイナリまで届く。

繰り返し作業の削減：はい — テンプレ選定・配色合わせ・レイアウト調整の手作業を削減

AI必要度：不要 — レイアウト数学は決定論プログラム

AIなしで実装可能：はい

運営コスト：低（生成時 CPU のみ）

外部APIコスト：無

コスト削減案：

- [x] エコモード — AI不使用
- [x] まとめて生成 — 1 回の pptx 生成にテンプレ適用
- [x] キャッシュ再利用 — templateId+content 決定論
- [x] 予約実行 — Automation powerpoint_generate / health verify
- [x] AI起動条件 — AIなし
- [x] 外部API最小化 — なし
- [x] 承認後実行 — 成果物生成フローに内包
- [x] 再生成禁止 — 同一入力で同一テンプレ構造

優先度：P3（47/100 評価の将来項目 #23）

## 正式出典（推測禁止）

47/100 超辛口レビュー / 優先度分類:

- P3 20 = JWT連携RLS（P3-01 COMPLETE）
- P3 21 = Company templateテナント分離（P3-02 COMPLETE）
- P3 22 = 高度なExcel（P3-03 COMPLETE）
- P3 23 = **PPTデザインテンプレ本格化**（本 P3-04）

## 開始時点の問題

- pptxgenjs の単一レイアウト描画のみ（Word のようなテンプレ登録簿なし）
- Automation `theme` / `slideCountHint` は UI 宣言のみで未配線
- `document-model` DesignTemplateId は PPTX に未接続
- OOXML `ppt/theme` はライブラリ既定のまま

## Acceptance Criteria

1. 複数テンプレ ID（business / simple / proposal / pitch / report）が存在し、生成バイナリの幾何・配色が ID ごとに異なる
2. Automation `theme` / `slideCountHint` が generator まで届く
3. `ppt/theme/theme1.xml` の accent がテンプレ/ブランド色に書き換わる
4. Production `/api/health/pptx-design` が同一 SHA で全 AC true
5. P0〜P2 / P3-01〜P3-03 を壊さない。P3-05 に着手しない
