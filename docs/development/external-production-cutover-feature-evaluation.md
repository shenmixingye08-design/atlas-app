# 【ATLAS機能評価】External Production Cutover（Phase 3-5）

機能名：Dropbox / WordPress Production Live Adapter + External Registry Cutover

ユーザー価値：Drive・Gmail・Calendar・Dropbox・WordPress を本物の外部処理として完了証拠付きで動かし、外部処理が Provider 側で完了した場合だけ Automation を completed にする。

差別化：OAuth/接続画面だけで終わらず、再取得検証・Idempotency・承認・Evidence・Registry 正式 Cutover まで含む。

繰り返し作業の削減：はい — 保存・投稿・公開の手作業と確認作業を削減

AI必要度：不要 — 外部 API・検証・Idempotency は通常プログラム

AIなしで実装可能：はい

運営コスト：外部 API 呼び出しのみ。AI 追加なし。WordPress 公開は承認付き。

外部APIコスト：有 — Dropbox / WordPress REST（ユーザー資格情報）

コスト削減案：

- [x] エコモード — AI 不使用
- [x] キャッシュ / Idempotency — 二重保存・二重投稿防止
- [x] 承認後実行 — WordPress publish
- [x] 外部API最小化 — 接続検証後のみ
- [x] 再生成禁止 — 永続 Idempotency
- [x] Preflight — active 前に不足を拒否

優先度：P0
