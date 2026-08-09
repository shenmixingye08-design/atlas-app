# 【ATLAS機能評価】P2-01 API契約テスト拡充

機能名：API契約テスト拡充（P2-01）

ユーザー価値：重要APIの契約破壊を公開前に検出し、本番炎上（回帰）を防ぐ

差別化：Production health で契約を実測し、memory/soft-success に依存しない

繰り返し作業の削減：はい — 手作業の API 回帰確認を減らせる

AI必要度：不要 — スキーマ／ステータス検証は通常プログラム

AIなしで実装可能：はい — Vitest 契約テスト + HTTP smoke + CI ban

運営コスト：低（CI数秒〜数十秒、Production probe は短時間 HTTP）

外部APIコスト：無

コスト削減案：

- [x] エコモードで足りるか — AI不使用
- [x] まとめて生成できるか — N/A（検証のみ）
- [x] キャッシュ再利用できるか — probe は短TTLのみ（force=1 で再実測）
- [x] 予約実行にできるか — Actions verify / Minute 外の push トリガ
- [x] AI起動条件を絞れるか — AIなし
- [x] 外部APIの呼び出しタイミングを最小化できるか — 自ホスト HTTP のみ
- [x] 完全自動ではなく承認後実行にできるか — apply/DDL 不要。公開 probe は読取のみ
- [x] 同じ処理を再生成しない設計にできるか — 契約定義はコード SoT

優先度：P2（47/100 評価の公開後項目 #15）

## 正式出典（推測禁止）

47/100 超辛口レビュー / 優先度分類:

- P2（公開後）項目 15 = **API契約テスト拡充**（本 P2-01）
- 問題 #19: `app/api/**/route.ts` 多数に対し route テスト不足。Playwright は依存にあるが CI 未使用
- 修正指示: **重要APIの契約テスト＋smoke E2Eをquality-gate必須化**

P2 全5項目（15–19 → P2-01–P2-05）:

1. P2-01 API契約テスト拡充 — COMPLETE
2. P2-02 非Word品質ゲート統一 — COMPLETE
3. P2-03 worker水平スケール — COMPLETE
4. P2-04 相関ID付き構造化ログの永続化 — see feature-evaluation-p2-04-structured-logs.md
5. P2-05 OCR専用エンジン評価（必要な場合のみ）— see feature-evaluation-p2-05-ocr-engine.md

## Acceptance Criteria

1. 重要API（Production 信頼性に直結する health / tick auth / automations auth）の契約テストが存在する
2. smoke（Production HTTP 契約検証）が存在する
3. Quality Gate で契約テストおよび CI ban が必須実行される
4. Production `/api/health/api-contracts` が live HTTP で契約を検証し `ok=true`（memory-only 判定禁止）
