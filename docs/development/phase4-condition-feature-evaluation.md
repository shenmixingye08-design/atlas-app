# 【ATLAS機能評価】Automation Phase 4 Condition / Event Trigger

機能名：Automation Phase 4 — Condition / Event Trigger

ユーザー価値：時間待ちだけでなく「条件になったら」「イベントが起きたら」仕事を自動着手でき、監視・判断・起動の手作業を減らす

差別化：NL → durable condition → false→true edge → 既存 V2 Work Queue / multi-step / approval / evidence まで Production 完走（UI・reserved・mock 止まりではない）

繰り返し作業の削減：はい — カレンダー監視・条件判定・起動・通知の習慣作業を削減

AI必要度：低 — NL パースはルールベース。評価・edge・dedupe・enqueue は通常プログラム

AIなしで実装可能：はい — 条件評価・polling・idempotency・完了ゲートは AI 不要

運営コスト：追加 AI なし。Minute tick での provider poll（ユーザー条件数に比例）

外部APIコスト：有 — Google Calendar list（評価時のみ）。作成 API は Phase 2 経路と分離

コスト削減案：

- [x] エコモードで足りるか — 評価自体に AI 不要
- [x] まとめて生成できるか — tick 内で複数 condition をバッチ評価
- [x] キャッシュ再利用できるか — lastConditionState / triggered resource ids を durable 再利用
- [x] 予約実行にできるか — false→true 時のみ enqueue（常時実行しない）
- [x] AI起動条件を絞れるか — AI 起動なし
- [x] 外部APIの呼び出しタイミングを最小化できるか — active condition のみ poll、lease で重複評価防止
- [x] 完全自動ではなく承認後実行にできるか — 既存 executionPolicy / awaiting_approval
- [x] 同じ処理を再生成しない設計にできるか — occurrenceKey unique + edge 検出

優先度：P0
