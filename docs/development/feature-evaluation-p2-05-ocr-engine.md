# 【ATLAS機能評価】P2-05 OCR専用エンジン評価（Document AI等）※必要な場合のみ

機能名：OCR専用エンジン評価（Document AI等）※必要な場合のみ（P2-05）

ユーザー価値：文字抽出の精度を Production で測り、足りない時だけ専用 OCR を要求する。精度未保証のまま「読めた」と偽らない。

差別化：Vision 転記を OCR と偽らない。ground-truth 評価 + Postgres SoT で再起動/インスタンス横断でも評価結果が残る。Document AI は必要な場合のみ。

繰り返し作業の削減：はい — 読めない文字の手入力・再依頼・精度事故の手直しを減らす

AI必要度：中 — 評価用抽出は Vision/専用 OCR。閾値判定・永続化・ポリシーは通常プログラム

AIなしで実装可能：一部 — 判定・永続・fail-closed は AI 不要。抽出自体は AI/OCR 必須

運営コスト：低〜中（Production probe 時のみ抽出 1 回。Document AI は未充足時のみ）

外部APIコスト：有 — 既定は既存 OpenAI Vision。Document AI は env 設定時かつ必要な場合のみ

コスト削減案：

- [x] エコモード — ユーザー毎に毎回 Document AI しない。評価は probe/強制時のみ
- [x] まとめて生成 — N/A（評価は単一 fixture）
- [x] キャッシュ再利用 — 評価結果を Postgres に永続（再評価は force）
- [x] 予約実行 — Actions verify / health probe
- [x] AI起動条件 — OpenAI 設定時のみ。未設定は fail-closed
- [x] 外部API最小化 — Vision が閾値を満たせば Document AI を起動しない
- [x] 承認後実行 — 低信頼 OCR は既存 automation 承認パスを維持
- [x] 再生成禁止 — evaluation id / correlationId で冪等 upsert

優先度：P2（47/100 評価の公開後項目 #19）

## 正式出典（推測禁止）

47/100 超辛口レビュー:

- OCR カテゴリ **25/100（危険）**
- 「製品OCRなし。モデル転記＋辞書補正のみ」「精度保証なし」
- P2（公開後）項目 19 = **OCR専用エンジン評価（Document AI等）※必要な場合のみ**

P2 全5項目（15–19 → P2-01–P2-05）の最終項目。**P3 には着手しない。**

## Acceptance Criteria

1. OCR エンジン評価が ground-truth fixture で実行される
2. Vision OCR が閾値未達のとき `dedicatedEngineRequired=true` となり、未設定なら fail-closed（偽成功禁止）
3. Vision OCR が閾値を満たせば Document AI は起動しない（必要な場合のみ）
4. 評価結果は Postgres SoT（memory は SoT ではない）
5. restart / retry / multi-instance / ownership isolation を Production probe で実証
6. CI ban + 専用テスト + `/api/health/ocr-engine`
7. P0 / P1 / P2-01〜04 を壊さない
