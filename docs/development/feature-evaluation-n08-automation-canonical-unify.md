# N-08: Automation canonical unify（表現分裂の解消）

## 【ATLAS機能評価】

機能名：Automation v1/v2 のユーザー向け「自動化」一本化（canonical model + UX）

ユーザー価値：昔作った自動化と新しい自動化を同じ画面・同じ操作で扱える。どちらを使うか迷わず、削除・停止・再開の意味が分かる。

差別化：内部世代（v1/v2）を隠したまま互換実行を維持し、秘書としての「任せて続く仕事」体験を一本化する。

繰り返し作業の削減：はい — 「どっちの自動化画面？」と調べ直す・別UIで同じ操作を覚える負担を減らす。

AI必要度：不要 — 名称統一・正規化・CRUD/状態の一本化は通常プログラム。実行本体は既存エンジン。

AIなしで実装可能：はい — adapter / UI / API / probe。AI呼び出しは追加しない。

運営コスト：追加AIなし。Production probe と CI ban の軽微な運用コストのみ。

外部APIコスト：無（既存 scheduler/worker/Memory 経路を維持）

コスト削減案：

- [x] エコモードで足りるか — 本変更はAIを増やさない
- [x] まとめて生成できるか — 対象外（表現統一）
- [x] キャッシュ再利用できるか — read-time normalization で再計算を抑制
- [x] 予約実行にできるか — 既存 schedule を維持
- [x] AI起動条件を絞れるか — AI追加なし
- [x] 外部APIの呼び出しタイミングを最小化できるか — 実行経路は既存のまま
- [x] 完全自動ではなく承認後実行にできるか — 既存 executionPolicy を維持
- [x] 同じ処理を再生成しない設計にできるか — legacy を破壊せず adapter で正規化

優先度：P0（品質評価 N-08・ユーザー体験の分裂は秘書価値を毀損する）

---

## 分裂箇所（調査サマリ）

| 領域 | 旧経路 (v1) | 新経路 (v2) | 分裂 |
|------|-------------|-------------|------|
| API | `/api/automations` | `/api/automation-platform` | 内部OK、UIが二重 |
| UI一覧 | AutomationCard / Row | AutomationV2Card | 「スケジュール型」見出しで世代露出 |
| Deep link | `?id=` | `?v2=` | 世代パラメータ露出 |
| 削除 | 未実装（coming soon） | archive（保管/Archive） | 削除表現弱・意味不明 |
| 状態ラベル | display.ts | status-labels.ts | 有効/稼働中 など不一致 |
| Memory | v1-automation-bridge | applyMemoryForAutomation | 経路は別だがどちらも適用必須 |
| Tick | work-queue | due-tick + claim | 同一 tick で両対応（維持） |

## Canonical model

ユーザー向け概念は常に「自動化」。内部 `generation: "v1" | "v2"` は UI に出さない。
legacy → `CanonicalAutomation` へ read-time normalize。データ破壊・無断削除なし。
