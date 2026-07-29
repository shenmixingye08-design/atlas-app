# Word / 通知 自動回帰テストとリリース判定

## 【ATLAS機能評価】

| 項目 | 内容 |
|---|---|
| 機能名 | Word・成果物・通知の回帰ゲートと監視 |
| ユーザー価値 | 別修正で Word/通知が壊れても本番に載せない |
| 差別化 | チャット品質ではなく「仕事完了」導線の継続保証 |
| 繰り返し作業の削減 | はい（手動確認・障害切り分けの習慣作業を削減） |
| AI必要度 | 不要 |
| AIなしで実装可能 | はい |
| 運営コスト | CI時間のみ（追加AI呼び出しなし） |
| 外部APIコスト | 無（モック中心） |
| コスト削減案 | キャッシュ不要 / AI起動なし / 承認後Production Promote |
| 優先度 | P0 |

## テスト構成

| レイヤ | コマンド | 内容 |
|---|---|---|
| ユニット | `npm run test:unit:gate` | Word/通知の安定ユニット（全 `test:unit` には既存失敗あり） |
| 統合 | `npm run test:integration` | 完了ゲート + 17項目回帰 |
| Word E2E | `npm run test:word-e2e` | Stage3/Pipeline + 回帰 |
| 通知 E2E | `npm run test:notification-e2e` | lifecycle + 回帰 |
| 型チェック | `npm run typecheck:gate` | 本番コード（`*.test.ts` 除外） |
| Lint | `npm run lint:gate` | Word/通知関連パス |
| 全体ゲート | `npm run release-gate` | build + 上記 |

モック: OpenAI / Supabase Storage・DB / Clerk（ルートテスト） / Commander（work-job実行）。

## 監視項目（PIIなし）

`getWordReleaseMonitoringSnapshot()` / Owner Word diagnostics の `releaseMonitoring`:

- Word依頼数 / 成功数 / 失敗数 / タイムアウト数
- 成功率 / 平均処理時間
- 工程別エラー数（ai_content / docx / storage / verify / notify / download / timeout）
- 通知作成失敗数 / ダウンロード失敗数

本文・依頼文・個人情報は集計しない。

## リリースゲート導入手順（Vercel）

リポジトリに `.github/workflows/release-gate.yml` を追加済み。  
**自動デプロイを危険に止めない**前提の推奨手順:

1. GitHub → Settings → Branches → `main` に **Required status check**: `Word / Notifications quality gate` を設定
2. Vercel Production は **自動 Promote せず**、ゲート成功後に手動 Promote（または Preview のみ自動）
3. 必要なら Vercel Ignored Build Step で「GitHub check 未成功なら build skip」を設定
4. `vercel.json` でデプロイ全停止などの危険変更は行わない

ゲート失敗時は **本番デプロイ可能な状態として扱わない**。

## 障害発生時の確認手順

1. GitHub Actions の Release Gate ログで失敗レイヤを特定
2. Owner → Word diagnostics / `releaseMonitoring` で件数・工程別エラーを確認
3. 失敗種別:
   - AI → `ai_content` / failed 通知
   - ストレージ → `storage` / 保存失敗
   - タイムアウト → `timeouts` / `timed_out`
   - 通知 → `notificationCreateFailures`（成果物は残る場合あり）
   - ダウンロード → `downloadFailures` + `/api/health/word-pipeline`
4. 再現: `npm run test:integration` → `npm run test:word-e2e`
5. ユーザー影響: 未読通知・再試行 CTA（もう一度試す）が生きているか確認

## 実環境でのみ確認できる処理

- 本番 Clerk セッションでの依頼〜ダウンロード
- Supabase Storage / DB の実書き込み
- OpenAI 実応答品質
- Android 実機ダウンロード
- Vercel 複数インスタンス間の durable 一貫性
