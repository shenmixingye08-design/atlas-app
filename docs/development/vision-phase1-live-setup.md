# Vision/OCR Phase1 実測セットアップ

この手順は **コストが発生する本番相当 Vision 呼び出し** です。承認後のみ実行してください。

秘密鍵の値をチャット・PR・ログへ貼らないでください。

## 必要な設定

### A. ローカル / Cloud Agent で provider 直実行（推奨）

Environment Secrets に設定:

```bash
OPENAI_API_KEY=...                 # OpenAI secret
QUALITY_LIVE_VISION=1              # 明示オプトイン（無いと実行拒否）
ATLAS_ATTACHMENT_STORAGE=local
# ATLAS_MOCK_LLM を true にしない
```

実行:

```bash
npm run test:vision-phase1:live
# または
QUALITY_LIVE_VISION=1 npm run test:vision-phase1
```

成果物: `/opt/cursor/artifacts/vision-phase1/<suiteId>/`

### B. 本番 HTTP（デプロイ先の OPENAI_API_KEY を使用）

追加:

```bash
PRODUCTION_E2E_BASE_URL=https://atlas-two-blush-43.vercel.app
CRON_SECRET=...                    # Vercel と同じ値
```

1ケース実行例:

```bash
curl -sS -X POST "$PRODUCTION_E2E_BASE_URL/api/internal/vision-eval" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"caseId":"vr_receipt_01","generateArtifact":true}'
```

`caseId` は `lib/vision-eval/cases.ts` の 100 件（例: `vr_invoice_03`）。

### C. 認証付き UI スクリーンショット

Clerk の本番テストユーザーでログインし、画像アップロード〜成果物までの画面を撮影してください。  
エージェント環境に Clerk セッションが無い場合、UI スクショはプレースホルダのみになります。

## OCR について

独立 OCR API はありません。Vision の `extractedText` / `fields` / `tables` を OCR 相当として評価します。

## 合格条件（要約）

- ライブ API 実行済み（モック不可）
- Vision n≥100 / OCR相当 n≥100
- Vision成功率 ≥95%、timeout率 <3% など（詳細は要件）
- 未達を隠さない。API未実行は FAIL
