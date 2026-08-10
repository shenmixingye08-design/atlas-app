# N-07: 通知 soft-success 排除

## 【ATLAS機能評価】

機能名：通知 soft-success（誤認成功）の Production 排除

ユーザー価値：仕事・Automation・成果物・外部操作が本当に終わったときだけ「完了」と分かる。失敗・一部成功・再試行中を誤って成功と見せない。

差別化：チャネル未設定や enqueue 成功を「成功 ACK」にしない。最終 side-effect 証拠があるときだけ SUCCESS。

繰り返し作業の削減：はい — 「成功したのに成果が無い」「失敗なのに完了通知」の確認・再実行の無駄を減らす。

AI必要度：不要 — 判定は通常プログラム（証拠・状態機械）。

AIなしで実装可能：はい

運営コスト：追加AIなし。Production probe / CI ban のみ。

外部APIコスト：無（判定層のみ）

コスト削減案：

- [x] エコモード — AI追加なし
- [x] まとめて生成 — 対象外
- [x] キャッシュ — 判定結果の idempotent 通知
- [x] 予約実行 — retry は RETRYING、成功通知は最終のみ
- [x] AI起動条件 — AI不使用
- [x] 外部API最小化 — 既存 provider response を厳密評価
- [x] 承認後実行 — partial は awaiting_review
- [x] 再生成禁止 — 同一 job の最終通知は idempotent

優先度：P0

---

## soft-success 発生箇所（調査）

| 箇所 | 問題 |
|------|------|
| `delivery.ts` LINE not_configured | `ok:true` + `notification_ack` success |
| `delivery.ts` Web Push sent=0 | `ok:true` + success ACK |
| `service.ts` | pushSentAt / delivered を未送信でも設定 |
| `retry-drain.ts` | チャネル未試行でも delivered |
| `commander/execute.ts` partial | `notifyWorkCompleted`（type=completed） |
| `emitters.ts` X success copy | 「準備が完了」表現 |
| `ensureNotificationDelivery` | 「完了通知を保証」ログが partial にも付く |

## Canonical Execution Result

`lib/notifications/execution-result.ts` — SUCCESS は side-effect 証拠必須。PARTIAL / RETRYING / FAILED / UNKNOWN を厳格に分離。通知 type は result から導出。
