# N-04: Notion / YouTube stub 露出排除

## 【ATLAS機能評価】

機能名：Production未提供外部連携（Notion / YouTube）のユーザー露出排除

ユーザー価値：使えない連携を「接続できる」と誤認しない。無駄な接続操作・課金期待・Automation設定をなくす。

差別化：capability正本に基づき UI / API / Automation / 料金 / LP を一貫して fail-closed。stub が success を返さない。

繰り返し作業の削減：はい — 「接続したのに動かない」確認・再設定の無駄を減らす。

AI必要度：不要 — 判定は capability レジストリと通常プログラム。

AIなしで実装可能：はい

運営コスト：追加AIなし。Production probe / CI ban のみ。

外部APIコスト：無（Notion / YouTube を新規実装しない）

コスト削減案：

- [x] エコモード — AI追加なし
- [x] まとめて生成 — 対象外
- [x] キャッシュ — capability 正本の再利用
- [x] 予約実行 — 対象外
- [x] AI起動条件 — AI不使用
- [x] 外部API最小化 — stub 呼び出し自体を拒否
- [x] 承認後実行 — unsupported は SUCCESS にしない（N-07整合）
- [x] 再生成禁止 — 対象外

優先度：P0

---

## 実装状態分類

| 対象 | 分類 |
|------|------|
| Notion external-service connector | stub（`stubConnectService` → connected） |
| YouTube external-service connector | stub（同上） |
| Notion connectors catalog | UI-only（`defaultStatus: available`） |
| Notion integrations registry | stub connect via placeholder |
| YouTube workflow step「YouTube投稿」 | UI exposure（実APIなし） |
| YouTube制作テンプレート / 台本 | content_only（公開APIではない — 維持） |
| Owner Notion | `implementation: stub`（正直） |

## Capability 正本

`lib/integrations/production-capability.ts`
