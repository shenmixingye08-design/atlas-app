# N-03: PowerPoint 商品面・依頼導線の成立

## 【ATLAS機能評価】

機能名：PowerPoint（.pptx）の商品面発見・依頼導線・生成到達の一貫化

ユーザー価値：PowerPoint資料を「作れると分かり、依頼し、完成ファイルをダウンロード」できる。探し回らない。

差別化：既存 pptx generator / P3-04 デザイン基盤を再利用し、商品面と routing だけを正直に接続する。

繰り返し作業の削減：はい — 「PowerPointできるか？」の確認・別ツールへの切替を減らす。

AI必要度：低 — 本文生成は既存パイプライン。N-03自体は capability・routing・露出の通常プログラム。

AIなしで実装可能：はい（露出・判定・probe）。生成本体は既存。

運営コスト：追加AIなし。見本1件の生成と Production probe。

外部APIコスト：無

コスト削減案：

- [x] エコモード — AI追加なし
- [x] まとめて生成 — 対象外
- [x] キャッシュ — 見本ファイル再利用
- [x] 予約実行 — 対象外
- [x] AI起動条件 — 変更なし
- [x] 外部API最小化 — 新規APIなし
- [x] 承認後実行 — 対象外
- [x] 再生成禁止 — 見本は確定ファイルとして固定

優先度：P0

---

## 根本原因

生成基盤（`PptxDeliverableGenerator` / pptx-design）は Production で存在するが、

- LP 見本に .pptx がない
- 形式ピッカーに PowerPoint がない
- 「PowerPointで」「パワポ」等の明示キーワードが detect ルールに弱い
- ホーム/お願いプリセットが「PowerPoint」と名乗らない

ため、ユーザーが発見・到達できない。
