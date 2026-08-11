# MINERVOT Production 完全新規・超辛口品質再評価（正式原本）

- **評価日**: 2026-08-10
- **対象**: `shenmixingye08-design/atlas-app` Production (`https://atlasapp.jp`)
- **評価種別**: ゼロベース再評価（旧47/100の再計算ではない）
- **コード変更**: なし（本ドキュメントは評価原本の保存のみ）
- **main HEAD SHA**: `237d0e9b011e6c6d409eeb26e32a6b707c38a0a0`
- **Production SHA**: `237d0e9b011e6c6d409eeb26e32a6b707c38a0a0`
- **SHA一致**: **YES**
- **旧評価**: 47/100（P0〜P3 / 23項目 CLOSED）
- **本評価スコア**: **63/100**
- **改善幅（算術差のみ・加点理由にしない）**: +16

## 評価方針（厳守）

1. 「お金を払って使いたいか」を最優先。機能の存在だけでは加点しない。
2. Production実測を優先。未確認は減点。
3. fake probe / test-only path を体験証拠にしない。
4. 旧23項目の消化を理由に加点しない。
5. ログイン後の実ユーザー依頼〜Automation定期実行〜Memory再利用は、本評価環境に本番ユーザー認証が無いため **未確認** とし、該当カテゴリを大きく減点する。

## 実測サマリー

| 種別 | 結果 |
|---|---|
| `/api/health/version` | ok, `237d0e9` |
| 公開health probe | 多くは ok。`memory-apply` / `vision` / `word-pipeline` / `word-request-trace` / `reliability-events` は 401（認証必須） |
| 一時的不安定 | 並列負荷時に `api-contracts` 503、`notification-retry` drain_failed を観測。再試行で回復 |
| `external-monitor` | ok=true だが `smokeOk=false` |
| 公開ページ | `/` `/pricing` `/sign-in` `/sign-up` 200。`/projects` `/automations` `/workspace` は未ログインでログイン画面へ |
| 見本DL | Word/Excel/PDF/SNS/Email 実ファイル取得可。**PowerPoint見本なし** |
| UI実測 | ランディング（desktop/mobile）、料金、サインイン画面をブラウザ確認 |

証拠保管: `/opt/cursor/artifacts/minervot-reeval-20260810/`

---

# MINERVOT NEW FINAL SCORE = 63/100

旧評価 = 47/100  
新評価 = 63/100  
改善幅 = +16（算術差。加点根拠ではない）

## サマリー判定

1. **総合点**: 63/100
2. **Production公開判定**: **NO（強く推奨しての一般公開は尚早）** — 限定βなら可
3. **β版公開判定**: **YES（限定β）**
4. **有料公開判定**: **CONDITIONAL** — 980円は条件付き。価値ループの実ユーザー検証が先
5. **Automation**: 58/100
6. **Memory**: 48/100
7. **成果物生成**: 70/100
8. **UX**: 68/100
9. **Reliability**: 71/100
10. **Security**: 84/100
11. **Mobile UX**: 74/100
12. **継続利用価値**: 52/100
13. **980円/月の妥当性**: **CONDITIONAL**
14. **3,000円/月の妥当性**: **CONDITIONAL（厳し目）**
15. **10,000円プラン成立可能性**: **NO（現状）**

### Automation最重要質問

> 一度設定したら、ユーザーがほぼ触らなくても MINERVOTが仕事を継続して進められるか？

**判定: PARTIAL**

- DB SoT / tick / schedule capability matrix / retry・idempotency系probeはProductionで一定の基盤を示す。
- しかし本監査では「実ユーザーが日本語で作成 → 毎日/毎週が無人で回り → 成果物/外部副作用 → 通知」までをログイン実測できていない。
- UI上の「準備中 / 順次対応」、祝日除外未対応、v1/v2二重表現、通知 soft-success が残る。
- よって YES にはできない。

### 有料サービス独立評価

| 問 | 判定 | 理由 |
|---|---|---|
| A. 無料なら使いたいか | **YES** | 価値訴求は明確。見本DLで「完成物」の片鱗は見える |
| B. 月額980円 | **CONDITIONAL** | 朝のメール/SNSが本当に無人で回り続けるなら妥当。本監査では未証明 |
| C. 月額3,000円 | **CONDITIONAL** | Google連携+SNS自動投稿が安定して初めて。未ログイン検証不可で減点 |
| D. 月額10,000円上位 | **NO** | Premiumの動画/画像生成フラグと実装実態のギャップが大きい。継続無人運営の証明不足 |

**3か月継続課金の理由があるか**: **弱い / 未証明**。  
「設定したらあとは触らない」体験がProductionで実証されれば継続理由になるが、現状は約束が先行。

---

## 30カテゴリ詳細採点

### 1. 初回利用UX — **72/100**
- **証拠**: ランディング実測（`/tmp/computer-use/ee46f.webp`）、CTA「今すぐ1件終わらせる」「無料で始める」、ChatGPT比較表、見本・980円導線
- **良い点**: 初見で「会話AIではない／仕事が終わる」が伝わる
- **問題点**: 「登録後60秒以内に1件完成」主張（meta/hero）。初回成功のログイン後実測は未確認。Clerk表記
- **影響**: 期待値と初回体験のギャップで離脱しやすい

### 2. ホーム画面の分かりやすさ — **45/100**
- **証拠**: `/projects` 未ログインはログイン誘導のみ。ホーム中身はコード上存在（`ProjectsDashboard` / feature flag）だがProductionログイン実測なし
- **良い点**: 認証ゲートは正しい
- **問題点**: 本評価でホームUXをProduction確認できず大幅減点
- **影響**: 「次に何を押すか」の本番体験が未検証

### 3. 依頼開始の分かりやすさ — **55/100**
- **証拠**: ランディングは依頼→完成の物語が明確。実装は `/workspace` + orchestrate（コード）。ログイン後未確認
- **良い点**: カテゴリ説明は上手
- **問題点**: 実フォーム操作・失敗時導線は未確認
- **影響**: 初回コンバージョン後の摩擦が不明

### 4. 依頼内容のAI理解 — **40/100**
- **証拠**: Productionで実依頼を投げて理解品質を測れず **未確認**
- **良い点**: orchestrate経路・品質ゲートは存在する（コード/health）
- **問題点**: 「理解して仕事を進める」体験の中核が未実測
- **影響**: 有料価値の根幹が点数に載せられない

### 5. Automation UX — **50/100**
- **証拠**: `/automations` は認証必須。UI/APIはコード上充実。i18nに「削除は順次対応」「履歴は順次対応」
- **良い点**: Automation-first思想の導線設計あり
- **問題点**: 本番画面操作未確認。v1表現の「順次対応」が信頼を削る
- **影響**: 主役機能なのに体験証明が弱い

### 6. Automation設定の簡単さ — **52/100**
- **証拠**: create wizard（コード）。条件/イベントトリガー「準備中」。schedule capability: daily/weekly/monthly対応、holiday unsupported
- **良い点**: 主要周期はサポート宣言が正直
- **問題点**: 自然言語→自動化のProduction成功を未確認。高度トリガー未完成
- **影響**: 「少ない操作で完了」は未証明

### 7. Automation実行信頼性 — **70/100**
- **証拠**: `automation-v2-db` ok（dbSotReady/memoryNotSot）。`work-queue` ok。`side-effect-idempotency` ok。`reliability` flagsOk
- **良い点**: 基盤はProductionでかなり厚い
- **問題点**: 実スケジュール発火のユーザー観測なし。負荷時probe一瞬失敗
- **影響**: エンジニア視点では安心、ユーザー視点では未証明

### 8. Automation変更・停止・再開 — **58/100**
- **証拠**: pause/resume/archive API（コード）。削除はv1で「順次対応」コピーあり
- **良い点**: 運用操作のAPI面は揃っている
- **問題点**: Production UI実操作未確認。削除体験の一貫性不足
- **影響**: 怖くて止められない/消せない印象になりうる

### 9. Automation履歴・失敗確認 — **55/100**
- **証拠**: runsページ（コード）。v1に履歴「順次対応」文言
- **良い点**: v2 runs設計あり
- **問題点**: 失敗理由が一般ユーザーに分かるか未確認
- **影響**: 障害時の自己解決ができないと解約につながる

### 10. Memory — **48/100**
- **証拠**: `/api/health/memory-apply` = 401。settings/memory 経路はコード上存在。personal-memory scopesは豊富
- **良い点**: 「黙って上書きしない」方針がある
- **問題点**: Productionでの反映実測不可。保存できる≠次回楽になる
- **影響**: 毎回同じ指示を強いられるリスクを否定できない

### 11. Personalization — **45/100**
- **証拠**: memory-apply overlays / resolve（コード）。Production適用は未確認
- **良い点**: スコープ設計は秘書プロダクトとして妥当
- **問題点**: 実ユーザー成果物への反映を観測できず
- **影響**: 差別化の核が未証明

### 12. 過去の好みの再利用 — **42/100**
- **証拠**: 未確認（ログインなし）
- **良い点**: 設計意図は「同じ指示を繰り返させない」
- **問題点**: 到達度をProductionで示せない
- **影響**: 継続課金理由が弱い

### 13. Word生成 — **74/100**
- **証拠**: `/samples/weekly-report.docx` 取得・ZIP健全・日本語本文確認。`deliverable-quality.wordImageEmbedOk=true`
- **良い点**: 見本は開ける。構造品質probeあり
- **問題点**: 実依頼生成は未確認。目次は手作業更新が必要
- **影響**: 「提出できるWord」かは案件依存で未証明

### 14. Excel生成 — **72/100**
- **証拠**: 見本xlsx取得可。`excel-advanced` pivot/chart ok。見本自体にchart/pivotなし
- **良い点**: 高度Excelの構造probeはProduction PASS
- **問題点**: ランディング見本が基本表のみ。実務グラフ付き体験は未確認
- **影響**: 訴求と見本の温度差

### 15. PowerPoint生成 — **58/100**
- **証拠**: `pptx-design` probe ok。しかしランディングHTMLに PowerPoint 出現0、見本manifestにpptx無し
- **良い点**: 生成器/テンプレ基盤はProductionに存在する
- **問題点**: ユーザーが触れる証拠（見本・訴求）が弱い＝価値が伝わらない/孤児機能化
- **影響**: PPTが必要な顧客を獲得できない、または期待外れ

### 16. PDF生成 — **76/100**
- **証拠**: 見本PDF `%PDF-1.7` 取得。`pdf-tables` ok
- **良い点**: 表を含むPDF品質の構造確認あり
- **問題点**: 実案件PDFの内容品質は未確認
- **影響**: 企業提出用途は追加検証が必要

### 17. OCR / Vision — **50/100**
- **証拠**: `ocr-engine` ok（`dedicatedEngineRequired=false`, vision path）。`vision` healthは401
- **良い点**: fail-closed / ownership系フラグあり
- **問題点**: 精度のユーザー実測なし。専用OCRエンジンは不要判定だが実務精度は未知
- **影響**: レシート/名刺期待で失望しうる

### 18. ファイルアップロード — **48/100**
- **証拠**: upload UI/SSRF probe（`upload-ssrf` ok）。実アップロード未確認
- **良い点**: SSRF対策probeあり
- **問題点**: 体験（進捗/失敗/再送）未確認
- **影響**: 入口摩擦が不明

### 19. 成果物ダウンロード — **70/100**
- **証拠**: 公開samplesダウンロード成功。アプリ内 `/results` は未確認
- **良い点**: 「実ファイルを渡す」文化はランディングで示されている
- **問題点**: 本番ジョブ後のDL導線未確認
- **影響**: 完成通知→取得の最後の一手が未検証

### 20. Notification — **62/100**
- **証拠**: `notification-retry` 再測で ok（drainSmokeOk）。コード上 soft-success（not_configured等をACK）あり
- **良い点**: retry/DLQ基盤はProductionで動く証拠あり
- **問題点**: 設定ミスを成功扱いにする可能性。ユーザー通知実受信は未確認
- **影響**: 「終わったのに気づかない」事故

### 21. 外部サービス連携 — **55/100**
- **証拠**: OAuth暗号化probe ok。YouTube/Notionは `stubConnectService`。GitHub/Slack等は「実装準備中」コピー
- **良い点**: Google/X/Dropbox/WPは実接続系
- **問題点**: stub/準備中がカタログに残る。接続後の定常業務は未確認
- **影響**: 連携期待で課金→失望

### 22. Error UX — **45/100**
- **証拠**: 未ログインでの業務エラー画面はほぼ未確認。bell失敗時0件化など soft empty（コード）
- **良い点**: 一部health/APIはfail-closed
- **問題点**: 「次に何をすればいいか」一般ユーザー向けが未実証
- **影響**: 障害時に放置・解約

### 23. Retry / Recovery — **68/100**
- **証拠**: work-queue / side-effect-idempotency / notification-retry（再測ok）
- **良い点**: 復旧の機械的基盤は強い
- **問題点**: ユーザー可視の復旧UX未確認。一時的probe失敗あり
- **影響**: 裏側は耐えても表側で不安

### 24. Performance — **55/100**
- **証拠**: 見本生成は数十〜数百msだがAI経路ではない。60秒主張あり。実orchestrateレイテンシ未測
- **良い点**: 静的見本は軽い
- **問題点**: 有料体験の速度が未確認のまま強く謳われる
- **影響**: 期待外れの最速ルート

### 25. Mobile UX — **74/100**
- **証拠**: 390pxランディング実測（`ed318.webp`）。manifest/PWA install表示。bottom navはコード
- **良い点**: 公開面のモバイルは使える
- **問題点**: ログイン後のAutomation設定の親指完結は未確認。SWはpush中心
- **影響**: スマホ運用が本命なら追加検証必須

### 26. Reliability / Durability — **71/100**
- **証拠**: work-queue / automation-v2-db / structured-logs / worker-scale 等 ok。external-monitor smokeOk=false。一時的503/drain失敗
- **良い点**: SoT/multi-instance意識が高い
- **問題点**: 監視smoke未完。間欠失敗の説明責任
- **影響**: 無人運用の信頼が一段足りない

### 27. Security — **84/100**
- **証拠**: authz ok、secrets-leakage ok、oauth-encryption ok、jwt-rls ok、保護ルート401
- **良い点**: 認証・秘匿・暗号化のProduction証拠が厚い
- **問題点**: サービスロール中心設計の残余リスクは構造上残る（本監査で侵害試験は未実施）
- **影響**: 有料SaaSとして相対的に強い領域

### 28. Privacy / Tenant Isolation — **80/100**
- **証拠**: company-template ownership ok、jwt-rls isolation ok、household ownership ok、structured-logs crossUserIsolated
- **良い点**: テナント分離の機械証拠あり
- **問題点**: Memory横断漏洩のログイン実測なし
- **影響**: B2B安心には追加監査が望ましい

### 29. Billing / Plan Enforcement — **60/100**
- **証拠**: pricingページ実測、plans registry（980/2980/9800）、billing-schema ok。Premiumに `video_generation` / `image_generation`。`lib/pr/types.ts` は将来フラグ未実装と明記
- **良い点**: 価格の見せ方は上手。enforce配線あり
- **問題点**: 上位プラン能力と実装のギャップ。Checkout実決済フロー未確認
- **影響**: 高額プランの信頼毀損リスク

### 30. 継続利用価値 — **52/100**
- **証拠**: 約束（朝のスロットを外す）は強い。Automation PARTIAL、Memory未証明
- **良い点**: 継続課金に必要な「習慣代替」コンセプトは正しい
- **問題点**: 「触らなくても進む」が未実証なら3か月継続理由が弱い
- **影響**: お試し→解約になりやすい

---

## Automation特別監査（100点満点）: **58/100**

| 観点 | 判定 | 根拠 |
|---|---|---|
| 自然な日本語から作成 | 未確認 | ログイン実測なし |
| 毎日/毎週/毎月 | PARTIAL | capability matrix上 supported |
| 曜日・時刻 | PARTIAL | weekly/timezone/dst supported宣言 |
| 即時実行 | 未確認 | APIあり、実測なし |
| 実行前確認 | 未確認 | approve系APIあり |
| 繰り返し | PARTIAL | 基盤あり、実観測なし |
| 編集/停止/再開 | PARTIAL | APIあり、UI実測なし |
| 削除 | WEAK | v1「順次対応」コピー |
| 履歴/成功/失敗理由 | PARTIAL | v2 runsあり、実測なし |
| retry / crash / idempotency / multi-instance | GOOD | health証拠 |
| external side effect / notification / memory / 好み | WEAK〜未確認 | soft-success / apply未確認 |
| 成果物・外部連携 | PARTIAL | 配線はあるがE2E未確認 |
| スマホ設定・少ない操作 | 未確認 | |

**Hands-off判定: PARTIAL**

---

## Memory特別監査（100点満点）: **48/100**

| 観点 | 判定 |
|---|---|
| 文体/長さ/構成の学習再利用 | 未確認 |
| 成果物形式・テンプレ | 設計あり・適用未確認 |
| Automation設定の記憶 | 設計あり・適用未確認 |
| 過去修正・過去成果物 | 未確認 |
| 外部サービス利用傾向 | 未確認 |
| 「同じ指示を何度も言わせない」到達度 | **低い〜未証明** |

保存UIとresolve優先順位はあるが、Productionで「次回が明らかに楽」を示せていない。

---

## 成果物品質（単体）: **70/100**

| 形式 | 証拠 | 所見 |
|---|---|---|
| Word | 見本DL + probe | 開ける・日本語OK。目次手更新。実案件未確認 |
| Excel | 見本DL + advanced probe | 基本表は可。見本にグラフ/ピボット無し |
| PowerPoint | probeのみ | 見本なし・LP訴求なしで減点 |
| PDF | 見本DL + tables probe | 構造的には良い |

「ファイルが開ける」はクリア。だが「その仕事の提出物としてそのまま使える」はログイン実依頼なしのため上限を70に抑える。

---

## UX特別監査: **68/100**

一般ユーザー視点:
- **次に押すボタン（LP）**: 分かる（今すぐ1件終わらせる / 無料で始める）
- **専門用語**: Clerk、ChatGPT比較は一部ハードル
- **説明なしで使えるか**: LPは良い。アプリ本体は未確認のため減点
- **失敗時**: 未確認
- **スマホだけ**: LPは可。本編未確認

---

## 新規問題一覧（旧23項目の再利用禁止）

### Critical

#### N-01 Premium動画/画像能力の過剰表示
- **Severity**: Critical
- **現在の問題**: Premium plan features に `video_generation` / `image_generation` が含まれる一方、`lib/pr/types.ts` は未実装将来フラグと明記。i18nに動画部ステータス文言もある
- **Production証拠**: `lib/billing/plans/registry.ts`、pricingページ実測、`lib/pr/types.ts`
- **ユーザー影響**: 高額課金動機の虚偽認定リスク
- **根本原因**: プランカタログと実装成熟度の同期欠如
- **修正難易度**: B
- **期待効果**: 課金信頼の回復
- **推定スコア改善**: +3〜5

#### N-02 「60秒で1件完成」主張の未実証
- **Severity**: Critical（信頼）
- **現在の問題**: LP meta/heroで登録後60秒完成を主張。本監査でAI依頼の実時間未測
- **Production証拠**: `https://atlasapp.jp/` HTML / hero copy
- **ユーザー影響**: 初回期待外れ・返金/炎上
- **根本原因**: マーケSLAと実orchestrate時間の乖離管理なし
- **修正難易度**: S〜A（表現修正はS、実測SLA保証はA）
- **期待効果**: 信頼改善
- **推定スコア改善**: +2〜4

### High

#### N-03 PowerPointが商品面で不在
- **Severity**: High
- **問題**: pptx生成基盤はあるがLP言及0・見本0
- **証拠**: landing HTML PowerPoint=0、`samples/manifest.json` にpptxなし、`/api/health/pptx-design` ok
- **影響**: PPT顧客を獲得できない / 内部機能が価値化されない
- **根本原因**: 成果物ラインの商品化不均衡
- **難易度**: B
- **改善幅**: +2〜3

#### N-04 外部連携stubの残存露出
- **Severity**: High
- **問題**: Notion/YouTubeが `stubConnectService`
- **証拠**: `lib/integrations/notion/index.ts`, `youtube/index.ts`
- **影響**: 接続できると誤解して課金
- **根本原因**: レジストリ公開ポリシー不足
- **難易度**: S〜B
- **改善幅**: +2〜3

#### N-05 Memory適用のProduction実証不足
- **Severity**: High
- **問題**: memory-apply healthが認証必須で、本監査は反映を確認不能。体験価値が未証明
- **証拠**: `/api/health/memory-apply` 401
- **影響**: 「また同じこと言わせる」状態が残ると継続課金が成立しない
- **根本原因**: 適用効果の公開検証設計不足 + 本監査の認証限界
- **難易度**: A
- **改善幅**: +4〜7

#### N-06 外部監視smoke未完了
- **Severity**: High
- **問題**: `external-monitor` が `smokeOk=false`
- **証拠**: Production probe
- **影響**: 障害の早期検知が弱い
- **根本原因**: 監視delivery smoke未成立
- **難易度**: B
- **改善幅**: +1〜2

#### N-07 通知 soft-success による誤認
- **Severity**: High
- **問題**: not_configured等を成功ACKしうる
- **証拠**: `lib/notifications/delivery.ts` / retry-drain コメント
- **影響**: 通知が来ないのにシステム上成功
- **根本原因**: 運用可用性優先のACK設計
- **難易度**: B
- **改善幅**: +2〜3

#### N-08 Automation v1/v2のユーザー表現分裂
- **Severity**: High
- **問題**: 削除/履歴が「順次対応」と表示されうる一方v2には機能がある
- **証拠**: `lib/i18n/ja.ts`
- **影響**: 「未完成製品」印象、操作迷走
- **根本原因**: レガシーUI残存
- **難易度**: B
- **改善幅**: +2〜4

### Medium

#### N-09 祝日除外・高度トリガー未対応
- **Severity**: Medium
- **証拠**: `lib/work-queue/capabilities.ts` holiday unsupported、wizard「準備中」
- **影響**: 日本の業務カレンダーに合わない
- **難易度**: A
- **改善幅**: +1〜2

#### N-10 ランディングExcel見本が高度機能を示さない
- **Severity**: Medium
- **証拠**: 見本xlsxにchart/pivotなし（inspect）
- **影響**: 高度Excelの価値が伝わらない
- **難易度**: B
- **改善幅**: +1

#### N-11 health endpointの間欠失敗
- **Severity**: Medium
- **証拠**: 同一SHAで api-contracts 503 / notification-retry drain_failed を一度観測、再試行で回復
- **影響**: 運用判定の揺れ、潜在レース
- **難易度**: B
- **改善幅**: +1〜2

#### N-12 サインインのClerk露出
- **Severity**: Medium
- **証拠**: sign-in画面実測
- **影響**: 非エンジニアの不安
- **難易度**: S
- **改善幅**: +1

#### N-13 ログイン後コア体験が監査不能（評価メタ問題）
- **Severity**: Medium（プロセス）
- **問題**: 本番E2E監査用の安全な検証アカウント手順が無い
- **影響**: 今後も体験点を正しく上げられない
- **難易度**: B
- **改善幅**: 計測可能性 + 間接的に大きなスコア精度改善

### Low

#### N-14 Word目次の手動更新要求
- **Severity**: Low
- **証拠**: 見本docx文言
- **影響**: 小さな手戻り
- **難易度**: B
- **改善幅**: +0.5

#### N-15 PWAがオフライン業務アプリではない
- **Severity**: Low
- **証拠**: `sw.js` push中心、`/offline`
- **影響**: 通信不安定時の期待外れ
- **難易度**: A
- **改善幅**: +0.5

#### N-16 ホーム二重モード（feature flag）複雑性
- **Severity**: Low
- **証拠**: `automation_first_home_enabled` 分岐（コード）
- **影響**: 体験の個体差・説明困難
- **難易度**: B
- **改善幅**: +0.5

---

## 【100点までの新改善ロードマップ】（Phase番号なし・優先順位のみ）

総問題数: **16**（Critical 2 / High 6 / Medium 5 / Low 3）

### 優先順位（上から順）

1. **N-01** Premium未実装能力のカタログ削除または実装完了（誠実さ）
2. **N-02** 60秒主張を実測SLAに置換（または削除）
3. **N-05** Memoryが次回依頼を実際に楽にするProduction実証（計測可能なE2E）
4. **N-08** Automation UIをv2体験に統一（削除/履歴/失敗理由を一般ユーザー向けに）
5. **N-07** 通知を「届いていないのに成功」にしない
6. **N-04** stub連携をUIから完全隔離
7. **N-03** PowerPointを見本・訴求・品質証明まで商品化するか、表から外す
8. **N-06** external-monitor smokeを恒常PASSに
9. **N-13** 本番監査用の安全な検証アカウント/手順を用意（以降の再評価精度の前提）
10. **N-11** health間欠失敗の根因除去
11. **N-09** 祝日/高度トリガーの正直な範囲提示または実装
12. **N-10** 高度Excelを見本で証明
13. **N-12** Clerk露出の緩和
14. **N-14〜N-16** 低優先の体験研磨

### 100点条件（定義）

次をすべてProduction実測でYESにできない限り100点は出さない:

- 日本語1依頼で仕事が終わる（成果物または外部送信）
- 自動化を少ない操作で設定し、触らずに繰り返される
- 失敗時に理由が分かり、安全に再実行できる
- Memoryにより同じ指示を再入力しなくてよい
- 料金プランの全ハイライトが実在する
- スマホだけで主要運用ができる
- 3か月継続したくなる習慣代替がデータで示せる

---

## 旧評価との関係（参考）

- 旧23項目（P0〜P3）はProduction検証完了済み、という前提は受理する。
- ただし本スコアは「直したから加点」ではない。
- 現Productionを初見の有料秘書サービスとして採点した結果が **63/100**。

## 添付証拠パス

- SHA/version: Production `/api/health/version`
- Probes: `/opt/cursor/artifacts/minervot-reeval-20260810/probes.json`（取得時）
- Samples: `/opt/cursor/artifacts/minervot-reeval-20260810/samples-manifest.json`, `sample-inspect.json`
- UI screenshots: `/opt/cursor/artifacts/minervot-reeval-20260810/*.webp`

---

**評価完了。コード変更・PR・P4実装は行っていない。**
