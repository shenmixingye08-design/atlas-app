# Scheduler 本番信頼性証跡

## 【ATLAS機能評価】

機能名：Scheduler本番信頼性証跡（History / Metrics / Health / Alert）

ユーザー価値：予定時刻に仕事が実行されたことを実測データで証明し、偽完了・停止を即時検知する

差別化：「動くはず」ではなく「動いた証拠」を持つ。Fail Closed で途中成功を禁止

繰り返し作業の削減：はい — 運用者が手動で cron 生存確認する習慣を削減

AI必要度：不要 — 時刻・遅延・成功率・分類は通常プログラム

AIなしで実装可能：はい

運営コスト：AI呼び出しなし。tick 経路への証跡書き込みと Owner 監視のみ

外部APIコスト：無

コスト削減案：

- [x] エコモードで足りるか — N/A（観測基盤）
- [x] まとめて生成できるか — メトリクスは集約計算
- [x] キャッシュ再利用できるか — Health API は no-store（鮮度優先）
- [x] 予約実行にできるか — Scheduler 本体
- [x] AI起動条件を絞れるか — AI不使用
- [x] 外部APIの呼び出しタイミングを最小化できるか — 外部APIなし
- [x] 完全自動ではなく承認後実行にできるか — Alert は自動、修復は Owner
- [x] 同じ処理を再生成しない設計にできるか — scheduleId / jobId で証跡一意化

優先度：P0

## 完成条件（Fail Closed）

Scheduler が起動していない / 開始証跡がない scheduled job は **completed 禁止 → failed**。

## 実測

`npm run test:scheduler-proof` → `/opt/cursor/artifacts/scheduler-proof/`
