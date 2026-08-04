# Automation Platform Phase 1 — 既存「定期の仕事」監査

監査日: 2026-08-01  
対象: リポジトリ実装事実（本番ログは未確認）

## 総括

既存の「定期の仕事」は **部分実装**。主要コードは存在するが、指定時刻実行・承認・Retry・履歴永続化・Memory接続に重大なギャップがある。  
**「本番で正常動作」と断定できる項目はない**（証跡なし）。

## 22項目分類

| # | 項目 | 分類 | 根拠 |
|---|------|------|------|
| 1 | 画面コンポーネント | 部分実装 / デッドコードあり | `components/automations/*`。削除UIはdisabled。未使用設定コンポーネントあり |
| 2 | 作成・編集・削除API | 部分実装 | GET/POST/PATCH/run あり。DELETEなし。schema検証が弱い |
| 3 | DBテーブルと型 | 部分実装 / 設計不整合 | 定義は `atlas_user_state` JSON。Jobのみ `atlas_automation_jobs` |
| 4 | スケジュール保存形式 | 部分実装 / 壊れている | cron保存されるが実行計算はpresetのみ。カスタムCronはdailyへ潰れる |
| 5 | 定期実行開始 | 実装済みだが本番未検証 / 設計不整合 | `/api/automations/tick`。`vercel.json` は日次 `0 0 * * *`（UTC） |
| 6 | Queue/Worker | 部分実装 | Jobテーブルあり。独立Workerなし。Cron HTTP内同期実行 |
| 7 | ジョブ処理 | 実装済みだが本番未検証 | `executeAutomationRun` → `orchestrate` |
| 8 | 成果物生成接続 | 部分実装 / 設計不整合 | 生成は呼ぶが通常project永続化を迂回。部分失敗でも成功扱いあり |
| 9 | 外部連携 | 部分実装 / セキュリティ不足 | Xは実接続。Drive uploadにuserId分離不足 |
| 10 | 通知 | 部分実装 | emitters接続。fire-and-forgetで消失リスク |
| 11 | 実行前確認 | 壊れている / 設計不整合 | executionLevelが非Xで強制されない。X承認はメモリのみ |
| 12 | 一時停止・再開・キャンセル | 部分実装 | enabledトグルのみ。実行中キャンセルなし |
| 13 | Retry | 部分実装 / 壊れている | backoffあるが日次Cronで無効化。hydrate漏れ・二重加算 |
| 14 | 重複実行防止 | 部分実装 | Job idempotency uniqueあり。tick claimは非atomic |
| 15 | タイムゾーン | 部分実装 / 設計不整合 | Asia/Tokyo対応あるがUI/表示不統一。DSTテストなし |
| 16 | 実行履歴 | 部分実装 | JSON内8件 + メモリRun。cold startで消失 |
| 17 | 最終実行日時 | 実装済みだが本番未検証 | lastRun更新あり |
| 18 | 次回実行日時 | 部分実装 | nextRun更新あるが精度・終了条件に欠陥 |
| 19 | エラー情報 | 部分実装 | lastError/Job errorあり。一部握りつぶし |
| 20 | ユーザー認可 | Automation APIは実装済み / 連携は不足 | Clerk + owner check。legacy integrationに穴 |
| 21 | テスト状況 | 部分実装 | 単体あり。schedule/DST/本番E2E不足 |
| 22 | 本番実行証拠 | 未実装（証跡） | checklist未チェック。Cron/migration/X未確認記録 |

## 根本問題

1. Automation定義とRunが正規分離されていない  
2. 実行契約（承認・Memory・Step）がプロンプト文に矮小化されている  
3. 日次Cronのため「指定時刻実行」を保証できない  
4. 永続化がJSON + メモリ混在で信頼性が低い  
5. ユーザー向け「定期の仕事」と内部能力が一致しない

## Phase 1 で追加した土台

- `lib/automation-platform/**` 統一モデル / Step Registry / Policy / Migration / API
- Feature flags: `automation_v2_enabled` / `automation_memory_enabled` / `automation_approval_enabled`（既定OFF）
- SQL: `supabase/migrations/20260801_atlas_automations_v2.sql`（本番自動適用なし）
- 既存 `/automations`（V1）は削除せず維持
