# Vision 実画像統合テスト手順

モック（`ATLAS_MOCK_LLM=true`）ではなく、実 OpenAI Responses API で画像解析が成功することを確認する。

## 前提

- `OPENAI_API_KEY` が有効
- 任意: `OPENAI_VISION_MODEL`（未設定時は `gpt-5.5`、allowlist 外は既定へフォールバック）
- `ATLAS_MOCK_LLM` は **設定しない** / `false`

## 自動ライブE2E

```bash
OPENAI_API_KEY=sk-... node scripts/vision-live-e2e.mjs
```

成功時: `/opt/cursor/artifacts/vision-live-e2e/result.json` に `ok: true`。

## 手動確認（スマートフォン画像）

1. Preview / Production にデプロイ
2. スマホで次をアップロードして解析
   - Android JPEG（縦向き・EXIF付き）
   - iPhone HEIC（サーバが JPEG へ変換できること）
   - PNG スクリーンショット
   - WEBP
   - 10MB超の高解像度写真（送信前に縮小されること）
   - レシート / 表がある書類 / 複数枚
3. 失敗時は診断IDを控え、管理者診断で次を確認
   - OpenAI `status` / `type` / `code` / `message` / `request_id`
   - `normalizeProfile` / `attempt` / `fallbackUsed`
   - MIME / width / height / byteLength
4. Supabase `atlas_user_state` domain=`atlasVisionDiagnostics` で診断レコードを追跡

## ユニットでカバー済み

- JPEG / PNG / WEBP 正規化
- EXIF orientation
- 高解像度縮小
- MIME マジックバイト検証
- 壊れた画像 / 空画像
- OpenAI 429/500 リトライ
- 空レスポンス失敗扱い
- 不正モデル env フォールバック
- 用途別プロンプト分岐（receipt 等）

## 本番反映後チェック

1. `npm run lint` / `npm run typecheck` / `npm test` / `npm run build`
2. ライブE2E成功
3. スマホ実画像で `vision_response` 成功
4. 成果物（Excel/Word 等）が壊れないこと
