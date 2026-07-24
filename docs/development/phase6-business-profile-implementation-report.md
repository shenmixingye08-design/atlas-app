# Phase 6 実装報告（業務プロフィール）

## 1. 変更ファイル一覧（主要）

- `supabase/migrations/20260725_atlas_business_profiles.sql`
- `lib/business-profile/**`（types/service/repository/resolve/sanitize/tests）
- `app/api/business-profiles/**`
- `app/api/business-contacts/**`
- `app/api/business-cases/**`
- `app/api/artifact-context/resolve/route.ts`
- `app/api/deliverables/generate/route.ts`（差し込み・needs_input）
- `lib/orchestration/run-for-user.ts`（sanitize 済みコンテキスト注入）
- `app/settings/business-profile/page.tsx`
- `components/settings/business-profile-settings.tsx`
- `components/settings/settings-business-profile-link.tsx`
- `lib/i18n/ja.ts`
- `.env.local.example`
- `docs/development/phase6-business-profile*.md`

## 2. 新規テーブル一覧

| テーブル | 用途 |
| --- | --- |
| `atlas_business_profiles` | 業務プロフィール |
| `atlas_business_profile_fields` | カスタム項目 |
| `atlas_business_contacts` | 連絡先 |
| `atlas_business_cases` | 案件（既存 `projects` と分離） |
| `atlas_business_case_contacts` | 案件↔連絡先 |
| `atlas_artifact_data_bindings` | 成果物への差し込みキー記録（値なし） |
| `atlas_profile_usage_logs` | 利用履歴（項目名のみ） |
| `atlas_extracted_document_fields` | 抽出フィールド（レビュー用・基盤） |

## 3. Migration 一覧

1. `20260725_atlas_business_profiles.sql`（Phase 6 一式）

## 4. RLS 設計

全テーブルで RLS 有効 + `anon, authenticated` deny-all。  
書き込みはサーバーの `SUPABASE_SERVICE_ROLE_KEY` のみ。API は Clerk `userId` で所有者検証。

## 5. 暗号化対象

- 銀行口座番号（`bank_account_number_encrypted`）
- sensitivity=`secret` のカスタム項目値
- 鍵: `ATLAS_BUSINESS_PROFILE_ENCRYPTION_KEY`（AES-256-GCM）
- 未設定時: Production は例外、開発は DEV ONLY 警告付きフォールバック

## 6. AI へ送らない情報

`sanitizeContextForAI` により除外:
- `aiUsageAllowed=false`
- `restricted` / `secret`
- `usageForbidden`
- 銀行口座関連すべて
- プロフィール丸ごと送信はしない（最小許可項目のみ）

## 7. 既存成果物生成との統合箇所

- `/api/deliverables/generate`: `resolveArtifactContext` → `needs_input`(422) or template apply → generate → usage log + binding
- `runOrchestrationForUser`: sanitize 済みテキストを metadata に注入（Planner/Deliverable コア非改変）

## 8. needs_input の動作

必須変数不足時:
- 成果物を completed にしない
- HTTP 422 + `{ status: "needs_input", missingRequired, ... }`
- failed ではない

## 9. モバイル画面

- `/settings/business-profile`
- 一覧・作成・編集・既定切替・削除二段階・カスタム項目・利用履歴
- 44px 級タップ、口座は下4桁マスク

## 10. テスト結果

`npm test -- lib/business-profile` → **17 passed**

## 11. build 結果

`ATLAS_OWNER_EMAILS=... npm run build` → **SUCCESS**

## 12. lint 結果

business-profile 関連は通過済み。リポジトリ全体の既存 lint 警告は残存しうる。

## 13. typecheck 結果

`next build` 内 TypeScript → **SUCCESS**

## 14. 未完了事項（正直）

- 連絡先・案件の**フル管理UI**は未実装（API はある）
- 登記PDF抽出の確認UI・confidence フローは**基盤テーブルのみ**（本格抽出UIは未完了）
- 郵便番号住所補完は未実装
- ロゴ画像アップロード検証UIは未実装
- 「今回だけ使用 / 保存して再利用」の成果物画面コンポーネントは API 応答対応のみ（専用UIは部分的）
- 本番実機検証・remote Migration 適用は**未検証**
- Excel 差し込みは main ブランチに xlsx が無い場合は対象外（docx/pdf/md/txt）

## 15. 本番環境で必要な環境変数

- `ATLAS_BUSINESS_PROFILE_ENCRYPTION_KEY`（必須級）
- 既存: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Clerk 系

## 16. Supabase で適用が必要な作業

1. `supabase/migrations/20260725_atlas_business_profiles.sql` を SQL Editor で適用
2. テーブル存在と RLS deny-all を確認
3. Encryption key を Vercel Production に設定して Redeploy

## 17. セキュリティ上の残存リスク

- Supabase 未適用環境では in-memory fallback（プロセス再起動で消える）— 本番では必ず Migration + service role
- DEV 暗号化フォールバックを Production で使わないこと
- 管理者画面から個人情報値を閲覧する API は追加していない（維持）
- 抽出フィールドの自動確定は未実装（勝手な確定はしていない）
