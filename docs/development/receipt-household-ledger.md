# レシート家計簿（Receipt Pipeline）

## 概要

Vision で `receipt` と判定された画像は、通常の Commander / 成果物生成へ流さず **Receipt Pipeline** へ分岐します。

## 流れ

レシート画像 → 種別判定 → Vision抽出 → 信頼度評価 →（低信頼のみ確認）→ 家計簿登録 → Excel → 月次分析

## データ

- Durable domain: `atlasHouseholdLedger`（`atlas_user_state`）
- 新規テーブルなし
- アカウント削除時に wipe

## API

- `POST /api/receipt/process` multipart `images` + optional `hint`
- `POST /api/receipt/confirm`
- `GET /api/receipt/entries`
- `PATCH /api/receipt/entries/[id]`
- `GET /api/receipt/export`
- `GET /api/receipt/analytics`

## 拡張

`lib/media-pipelines` の `MediaKind` に invoice / business_card / contract 等を追加済み。種別ごとに専用 Pipeline を増やす設計です。
