# 【ATLAS機能評価】P3-01 JWT連携RLS

機能名：JWT連携RLS（P3-01）

ユーザー価値：Clerk ユーザー identity を Supabase JWT claims に橋渡しし、RLS が DB 層でテナント分離を強制する。アプリ ownership の二重防御になり、設定ミス時の横断漏洩を防ぐ。

差別化：deny-all + service role のみに依存せず、`auth.jwt()->>'sub'` と Clerk userId を一致させた JWT 連携 RLS。Production probe で横断拒否を実測。

繰り返し作業の削減：はい — 所有権バグ調査・横断漏洩事故の手作業復旧を減らす

AI必要度：不要 — JWT mint・RLS・probe は通常プログラム

AIなしで実装可能：はい

運営コスト：低（短命 JWT mint + SELECT/INSERT。secret は env または Management API）

外部APIコスト：無（自ホスト Supabase のみ。Management API は secret 解決時のみ）

コスト削減案：

- [x] エコモードで足りるか — AI不使用
- [x] まとめて生成できるか — N/A
- [x] キャッシュ再利用できるか — JWT secret は短時間メモリキャッシュのみ（SoT ではない）
- [x] 予約実行にできるか — Actions verify / health probe
- [x] AI起動条件を絞れるか — AIなし
- [x] 外部APIの呼び出しタイミングを最小化できるか — Management API は secret 未設定時のみ
- [x] 完全自動ではなく承認後実行にできるか — DDL は idempotent apply。OAuth/秘密テーブルは JWT 開放しない
- [x] 同じ処理を再生成しない設計にできるか — probe row id / correlationId で冪等

優先度：P3（47/100 評価の将来項目 #20）

## 正式出典（推測禁止）

47/100 超辛口レビュー / 優先度分類（品質評価エージェント原文）:

- P3（将来）項目 20 = **JWT連携RLS**（本 P3-01）
- 続く P3: 21 Company templateのテナント分離徹底 / 22 高度なExcel / 23 PPTデザインテンプレ本格化
- コード根拠: `supabase/migrations/20260711_projects.sql` コメント  
  「Clerk JWT ↔ auth.uid() bridging is not enabled yet — do not open policies to anon.」
- 関連カテゴリ: データベース設計 70（改善必須） / セキュリティ 42（危険）
- ※ TOP20 問題 #20（スケジューラ容量）とは別番号。公開後/将来の優先度リスト #20 が正式。

P0/P1/P2 COMPLETE 後の最初の P3。**P3-02 には着手しない。**

## Acceptance Criteria

1. Clerk userId を `sub` に持つ Supabase 互換 JWT を mint できる（secret 欠落時は fail-closed）
2. Postgres RLS が `auth.jwt()->>'sub' = user_id` で行を許可/拒否する（anon は拒否）
3. 他ユーザー JWT では行を読めない（ownershipIsolationOk）
4. 不正署名 JWT / 無 JWT は拒否（failClosed）
5. probe 行は Postgres SoT（memoryNotSot / restartDurableOk / multiInstanceSafe）
6. CI ban + 専用テスト + Production `/api/health/jwt-rls` で `ok=true` と固有フラグを実測
7. P0 / P1 / P2 COMPLETE を壊さない。OAuth 等 service-role 専用テーブルは JWT 開放しない
