# 本番デプロイ・ロールバック標準手順（Phase 7）

## Pre-deploy

1. pre-deploy check（環境変数・シークレット・Feature Flag 安全側）
2. migration dry-run
3. backup 確認（DB / Storage / 設定）
4. `npm run typecheck`
5. `npm run lint`
6. unit test（関連スイート）
7. integration test
8. E2E smoke（本番相当。未実施ならデプロイしない）

## Deploy

1. canary または段階公開
2. health check（`/api/health/*`, `/api/status`）
3. post-deploy verification（公開対象機能のみ）
4. 監視ダッシュボードを 15 分監視

## Rollback 判定

以下のいずれかで即判定：

- Critical アラート（権限漏れ・課金事故・データ破壊疑い）
- 主要成功率の急落
- health 連続失敗
- Kill Switch 複数発動が必要な状態

## Rollback 実行

1. アプリを直前の安定版へ戻す
2. migration が expand/contract でない場合は DB 互換を確認（アプリだけ戻して壊れないか）
3. health + smoke
4. Status Page 更新
5. 事後報告

## 試験結果（エージェント）

ローカル制御環境での marker ロールバック演習は実施済み。  
**本番 Vercel / DB migration rollback は未実施** — Release Ready の条件としては未達。
