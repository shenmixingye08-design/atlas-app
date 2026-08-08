# 【ATLAS機能評価】P1-07 外部監視 / アラート

機能名：外部監視 / Ownerアラート（P1-07）

ユーザー価値：Automation / worker / notification / side-effect 障害を、ユーザー問い合わせより先に運営者が検知・復旧把握できる

差別化：会話型監視ではなく、durable SoT + single-winner Owner通知で運用負荷を減らす専属秘書インフラ

繰り返し作業の削減：はい — 手動ヘルスチェック・障害気づき遅延・通知爆撃対応を削減

AI必要度：不要 — 閾値判定・滞留検知・dedupeは通常プログラム

AIなしで実装可能：はい — DBメトリクス + 閾値 + Owner既存通知経路

運営コスト：tick毎の軽量DB読取/書込。AI呼び出しなし。Owner確認は異常時のみ

外部APIコスト：無（Owner LINEは既存経路。障害時のみ送信）

コスト削減案：

- [x] エコモードで足りるか — AI不使用
- [x] まとめて生成できるか — チェックを1サイクルで束ねる
- [x] キャッシュ再利用できるか — table-ready TTL / health probe cache
- [x] 予約実行にできるか — tick / cron 連動
- [x] AI起動条件を絞れるか — AIなし
- [x] 外部APIの呼び出しタイミングを最小化できるか — cooldown + single-winner
- [x] 完全自動ではなく承認後実行にできるか — failure injectionは認証付き
- [x] 同じ処理を再生成しない設計にできるか — incident fingerprint + dedupe_key

優先度：P1
