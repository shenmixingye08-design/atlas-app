# 【ATLAS機能評価】P2-02 非Word品質ゲート統一

機能名：非Word品質ゲート統一（P2-02）

ユーザー価値：PDF/Excel/PPTX でもゴミ成果物を有料納品しない

差別化：形式共通ゲート＋形式別検証を Production probe / CI で実証

繰り返し作業の削減：はい — 手戻り・品質苦情対応を減らす

AI必要度：低 — 再生成時のみ既存 regenerate フック。判定自体は通常プログラム

AIなしで実装可能：はい（ゲート判定） / 一部（再生成は既存 AI 経路）

運営コスト：低（ゲートは CPU のみ。再生成は既存上限内）

外部APIコスト：無（ゲート単体） / 再生成時のみ既存 OpenAI

コスト削減案：

- [x] エコモード — ゲート自体は AI なし
- [x] まとめて生成 — N/A
- [x] キャッシュ — 判定結果はリクエスト内のみ
- [x] 予約実行 — N/A
- [x] AI起動条件 — regenerate 時のみ
- [x] 外部API最小化 — 不合格でも不要な再生成は上限内
- [x] 承認後実行 — contentAlreadyApproved は既存 Word 経路を維持
- [x] 再生成禁止 — 合格コンテンツは再ゲートのみ

優先度：P2（47/100 公開後 #16 / 問題 #17）

## 正式出典（推測禁止）

47/100:

- P2（公開後）16 = **非Word品質ゲート統一**
- 問題 #17: content quality は Word 専用。xlsx/pdf/pptx 単独は短文/placeholder 通過可
- 修正: **全形式に共通品質ゲート＋形式別検証**

## Acceptance Criteria

1. 共通コンテンツ品質ゲートが docx / pdf / xlsx / pptx に適用される
2. 形式別の追加検証がある（xlsx 構造 / pptx スライド構造 等）
3. 非 Word 単独生成経路でも fail-closed（不合格なら成果物を返さない）
4. CI ban + Quality Gate + Production probe で実証
5. P1-01 / P1-08 構造品質および P2-01 API contracts を壊さない
