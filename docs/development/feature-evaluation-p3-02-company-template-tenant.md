# 【ATLAS機能評価】P3-02 Company templateのテナント分離徹底

機能名：Company templateのテナント分離徹底（P3-02）

ユーザー価値：選んだ会社テンプレートが再起動・別インスタンス後も自分だけに残り、他人の設定やデフォルトに巻き戻らない。依頼の部門・品質基準が正しいまま続く。

差別化：process memory Map / localStorage ではなく Postgres `atlas_user_state` SoT。サーバーがテンプレート解決の正本（client metadata で上書きさせない）。

繰り返し作業の削減：はい — 毎回テンプレートを選び直す・設定消失の手直しを減らす

AI必要度：不要

AIなしで実装可能：はい — durable domain + hydrate + probe

運営コスト：低（小さな JSON upsert）

外部APIコスト：無

コスト削減案：

- [x] エコモード — AI不使用
- [x] まとめて生成 — N/A
- [x] キャッシュ再利用 — Map はキャッシュのみ
- [x] 予約実行 — health / Actions verify
- [x] AI起動条件 — AIなし
- [x] 外部API最小化 — Supabase のみ
- [x] 承認後実行 — N/A（設定永続化）
- [x] 再生成禁止 — user_id+domain 冪等 upsert

優先度：P3（47/100 評価の将来項目 #21）

## 正式出典（推測禁止）

47/100 超辛口レビュー / 優先度分類:

- P3（将来）20 = JWT連携RLS（P3-01 COMPLETE）
- P3（将来）21 = **Company templateのテナント分離徹底**（本 P3-02）
- P3（将来）22 = 高度なExcel（ピボット/グラフ）— **着手禁止**
- P3（将来）23 = PPTデザインテンプレ本格化 — **着手禁止**

開始時問題: `globalThis.__atlasActiveCompanyByUser` + browser localStorage。restart / multi-instance で消失。orchestration が client `metadata.companyTemplateId` を優先。

## Acceptance Criteria

1. Active company は Postgres `atlas_user_state` domain `atlasActiveCompany` が SoT（memory はキャッシュ）
2. restart 後 hydrate で同一 templateId が復元される
3. ユーザー A/B が相互に見えない（ownershipIsolationOk）
4. サーバー解決が正本（client metadata spoof で他テンプレに化けない）
5. fail-closed（userId 欠落で apply 不可）
6. CI ban + 専用テスト + Production `/api/health/company-template`
7. P0〜P2 / P3-01 を壊さない。P3-03 に着手しない
