# 階層型メモリ + 成果物品質保証

## データ永続化

新規テーブルは追加していません。既存の `atlas_user_state` に domain key `atlasHierarchicalMemory` で保存します。

- Clerk privateMetadata + Supabase overflow（`forceSupabase: true`）
- RLS: 既存どおり `anon` / `authenticated` deny-all、service role 経由のみ
- userId で厳密分離（API は Clerk `auth().userId`）

## マイグレーション

追加 SQL マイグレーションはありません。既存 `20260711_atlas_user_state*.sql` が適用済みであれば動作します。

## 記憶の優先順位

1. 今回の明示指示（矛盾する記憶は除外）
2. conversation（一時）
3. job / automation
4. project
5. user
6. システム初期値（不足情報の軽微前提）

## 品質フロー

依頼 → 記憶取得 → 不足情報判定 → 生成 → 決定論QA + タイプ別評価 → 自動修正（最大2回） → 再評価 → 保存/要確認

重大エラーがある場合は高得点でも不合格です。
