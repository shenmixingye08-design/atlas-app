# CHECKPOINT（最新が先頭）

## 2026-09-23 #8 — X投稿画面・連携導線・入力欄

- **「連携」メニューの行き先**: `/connections`・`/integrations` が設定トップへ飛ぶだけだった → `/settings#settings-integrations`（外部連携グループ）へ。設定ハブは描画後にハッシュ位置へスクロール。
- **`/workspace/x`**（新規ユーザーの主導線）: 共通 `PageHeader`、見出しをキット化、空の一覧をカード化。手動投稿（作成欄＋下書き/予約/履歴）を折りたたみ `XManualPostSection` に移し、未連携時は「Xを連携して続ける」が唯一の主操作に。投稿方法カードにホバーと `aria-pressed`（未選択のままなのは意図的＝明示選択）。
- **入力欄が見えない不具合（ライトテーマ全体）**: `.minervot-lux` の `--form-control-bg` がカードと同色の `--surface-raised` で、枠線なしの入力欄が背景に溶けていた → `--surface-muted`（淡い色の入力枠）に。
- 開発プレビューに「X投稿」ビュー追加（`/api/x/autopost` を Playwright でモックすると未連携/連携済みを確認可能）。
- テスト: 関連 338件 pass。before/after: `verification-screenshots/design-unify/*x*`。

### 次
1. 実行履歴 `/automations/runs`（`run-list-page.tsx`）・通知・成果物詳細のキット確認。
2. 自動化カード下部の余白。
3. PR 作成（ユーザー指示待ち）。

---

## 2026-09-23 #7 — 自動化画面（/automations）をUIキットへ

- 開発プレビュー `/dev/automation-first-preview` に「自動化」ビューを追加（プレビュー内だけ fetch をフィクスチャに差し替え、実画面の `AutomationsDashboard` を描画）。認証なしで確認可能に。
- `automation-card.tsx`: 「繰り返し/次回」の灰色ボックス積み上げ → 区切り線付きの2列メタ情報。詳細リンクをキット化。
- `v2/operations-dashboard.tsx`: 7枚の件数タイル → 1枚のカードに横並び（0件は薄字）。対応が必要／本日のタイムラインを `ui-list` 行に。最近の成果物はホームと同じ `RecentDeliverables` を再利用。
- `automations-dashboard.tsx`: 運用ダッシュボード表示時は重複していた5枚の状態レールを非表示（同じ件数を運用データ側で表示）。「AIが動いている流れ」・見出し・リンクをキット化。`.stat-tile` もキットと同じ角丸・影に。
- テスト: 関連 481件 pass、CI ban n07/n08/p1-09 pass。before/after: `verification-screenshots/design-unify/*automations*`。

### 次
1. `/workspace/x`（X投稿、1000行）と `/connections` をプレビュー経由でキット化。
2. 自動化カード下部の余白が大きい（原因未確認）。
3. PR 作成（ユーザー指示待ち）。

---

## 2026-09-23 #6 — デザイン統一（UIキット）

### 方針
最も完成度が高かった `/today`（カード＋ステータスチップ＋メイン/サイドの2カラム）を基準に、ログイン後画面を1つのデザイン言語に統一。

### 今回変更したもの
- `app/globals.css`: `@layer components` に UI キットを追加（カード・リスト行・シェブロン・アイコンタイル・見出し・リンク・チップボタン）。レイヤー内なので Tailwind ユーティリティで上書き可能。
- `components/ui/card.tsx`（113ファイルが使用）/ `panel.tsx`: キットに統一（角丸16px・細枠・微影・ホバーで浮く）。
- `PageHeader` / `SectionHeader`: 見出し階層を統一。**バグ修正**: SectionHeader の説明文が `text-[var(--text-caption)]`（サイズでなく色扱い）で見出しより大きく表示されていた。
- ホーム: デスクトップでメイン（要対応・実行中・成果物・今日の予定・任せている仕事）＋サイド（件数・次回実行・任せた仕事・実績）の2カラム。AIコアと主要CTAを横並び。次回実行を1行カード化。新規ユーザーの3ステップを番号タイル付きカードに。
- 設定: グループごとにアイコン、行にシェブロンとホバー、デスクトップ2カラム。
- `/today` サイド・実行詳細（`run-review-panel.tsx`）もキットに移行。

### テスト
- 全体 vitest: 2779 passed / 3 failed（poppler 不在の PDF 3件のみ、既知）。CI ban n02/n03/n07/p1-09 pass。
- 画面: ホーム（PC/スマホ/ダーク）・今日・設定・成果物・通知・LP を確認。before/after は `verification-screenshots/design-unify/`。

### 次に最も価値が高い改善
1. 認証が必要な画面（`/automations`, `/workspace/x`, `/connections`）を Vercel Preview でキットに寄せる。
2. `components/automations/automations-dashboard.tsx` 内の独自カード表現をキット化。
3. PR 作成（ユーザー指示待ち）。

---

## 2026-09-23 #5 — 実行詳細ページ＋新規ユーザーの「生きている」感

### 今回変更したもの
1. **実行詳細 `/automations/runs/[runId]`**（ホームの成果物カードの遷移先）: アプリシェル外でナビが無かった → `AtlasAppShell` で包む。完了済み run では成果物を最上部に。種別を日本語表示（raw の `deliverable`/`external` を出さない、`ARTIFACT_KIND_LABEL`）、開くボタンを `.btn-brand` 化、`#artifact-*` の対象をハイライト。
2. **未定義トークン `--muted` を定義**（`text-[var(--muted)]` が58箇所で無効 → 薄字にならず本文色になっていた）。
3. **新規ユーザー**: 挨拶の横に小さな待機オーブ（`HomeCoreBadge`）。リピーターは従来どおり AIコアのカード。
- テスト: `lib/automation-first/run-review-rendering.test.ts`（成果物の位置・日本語ラベル）を追加。

### テスト
- tsc / eslint OK、`lib/automation-platform lib/design-system lib/automation-first` 311件+ OK、CI ban n03/n04/n07/p1-09 pass。
- 実行詳細は認証必須のためブラウザ確認不可 → サーバーレンダリングのテストで確認。

### 未検証（実認証・X連携が必要）
- `/workspace/x`（新規ユーザーの主要導線、`x-autopost-panel.tsx` 1000行）。実環境の Preview で最初の1件完了までを確認したい。

### 次に最も価値が高い改善
1. Vercel Preview（実認証）で `/workspace/x` → 初回完了 → ホームで AIコア完了表示、までの通し確認。
2. `run-review-panel.tsx` の他セクション（タイムライン・手順）の視覚整理（`rounded-2xl bg-[var(--surface-muted)]` の平板なリスト）。
3. PR 作成（ユーザーの指示待ち）。

### 触るファイル
`components/automations/v2/run-review-panel.tsx`, `components/workspace/x-autopost-panel.tsx`

---

## 2026-09-23 #4 — 連続サイクル（壊れ修正中心）

### 今回変更したもの（コミット順）
1. **ホームの「今すぐ実行／一時停止／再開」が何も更新しない不具合を修正**（`your-work.tsx`, `projects-dashboard.tsx`）: `onChanged` 未接続・エラー握りつぶしだった。再読込を接続し、実行中表示と結果（完了＋成果物件数／承認待ち／失敗）をその場に表示（`lib/automation-first/run-now-feedback.ts`+test）。次回・前回の時刻が生の ISO 文字列で出ていたのを整形。件数帯を1行に。
2. **リピーター向けに主要CTAを1行化**（`home-primary-actions.tsx`）: 実データがファーストビューに入るように。新規ユーザーは従来の大カード。ヘッダーの重複説明文もリピーターでは省略。
3. **`/today` にもライブ更新**: ホームのロジックを `lib/automation-first/use-live-ops-refresh.ts` に共通化し、`/today` でも実行中のみ静かに再取得＋完了モーション。
4. **CSS 変数の循環参照を修正**（`app/globals.css`）: `html.automation-design-system` で `--accent-muted`/`--accent-foreground` を `--brand-*` に再エイリアスしており循環 → フラグON時に全ての `--brand-muted` 背景が消え、`.btn-brand` の文字が濃色になっていた（ログイン後全画面に影響）。循環検出テスト `lib/design-system/css-var-cycles.test.ts` を追加。

### テスト
- 全体 vitest: 2777 passed / 3 failed（PDF 3件は poppler 不在の環境要因。base コミットでも同じ失敗を確認）。
- CI ban n02/n07/p1-09 pass。Playwright で実行ボタンの成功・失敗表示、ライブ完了、新規ユーザーCTAの配色を確認。

### 判断メモ
- 旧ホーム `secretary-home-dashboard.tsx` は `automation_first_home_enabled` が OFF の時のフォールバックとして残す（本番フラグ値が不明なため削除しない）。

### 次に最も価値が高い改善
1. 新規ユーザーのファーストビューに「AIが待機している」感覚（AIコア idle を軽く表示）＋最初の1件までの導線確認（`/workspace/x`）。
2. `/automations/runs/[id]` の成果物表示（ホームのカードから遷移する先）の完成度確認。
3. 他画面の `.btn-brand` / `--brand-muted` 利用箇所を目視確認（今回の CSS 修正の恩恵確認）。

### 触るファイル
`components/automation-first/automation-first-home.tsx`, `app/automations/runs/`, `components/workspace/x-autopost-panel.tsx`

---

## 2026-09-23 #3 — ホームのライブ更新＋完了モーション

### 今回変更したもの
- `lib/automation-first/home-core-state.ts`(+test): `activeRunIds` / `findNewlyCompletedRun`（このセッションで実行中を観測した run が **succeeded** になった時のみ。partial/failed は祝わない）と `completed` 状態を追加。
- `automation-first-home.tsx`: 実行中の run がある間だけ、タブ表示中のみ 20 秒ごとに運用データを静かに再取得（タブ復帰時は即時）。完了を検知したら AIコアを6秒間「『◯◯』が完成しました」＋成果物名に切り替え、タップで成果物へ。再取得失敗時は直前のデータを保持（初回ロードのエラー表示は従来通り）。実行中が無ければポーリングしない。
- `home-status-core.tsx` / `globals.css`: completed 表示（緑のコア拡大＋チェック描画＋既存 `motion-complete-bloom`）。reduced-motion ではチェックが即表示。
- `lib/automation-first/analytics.ts`: `home_run_completed_live` イベント。

### 改善理由
ホームを開いたまま仕事が終わっても画面が変わらず、「AIが仕事を進めて完成させた」瞬間が伝わらなかった。実データで完了を検知し、その瞬間を見せる。

### コスト
AI 呼び出しなし。追加は既存 API の再取得のみで、実行中かつタブ表示中に限定（20秒間隔）。

### テスト / 確認
- tsc / eslint OK、vitest 68件 OK、CI ban n02/n07/p1-09 pass。
- Playwright で API をモックし「実行中 → 完了 → 6秒後に通常状態へ戻る」「実行中が無くなるとポーリング停止」を確認。成果物カードも同時に出現。ライト/ダークでスクショ（`verification-screenshots/home-core/live-*.png`）。
- 注意: dev サーバーは CSS をキャッシュすることがある。見た目がおかしい時は `.next` を消して再起動。

### 次に最も価値が高い改善
1. `WorkCountStrip` と AIコアの情報重複の整理（ホーム上部をさらに簡潔に）。
2. `/today` の実行中表示にも同じライブ更新を適用（`today-work-page.tsx`）。
3. 旧ホーム `secretary-home-dashboard.tsx` の利用有無確認。

### 触るファイル
`components/automation-first/automation-first-home.tsx`, `components/automation-first/your-work.tsx`, `components/automation-first/today-work-page.tsx`

---

## 2026-09-23 #2 — ホームの優先順整理＋成果物カード

### 今回変更したもの
- `automation-first-home.tsx`: 「今日のMINERVOT」の並びを **要対応 → 実行中 → 最近完成したもの → 今日の予定 → 次回実行 → 任せている仕事 → 指標/週次統計** に変更（行動が必要なもの・成果が先、統計は後）。
- `components/automation-first/recent-deliverables.tsx`（新規）: 最近完成したものをカード化。ファイル種別バッジ（XLSX/DOCX/PDF/PPTX）、カード全体で詳細へ、`url` がある場合は直接開くボタン（外部URLはリンクアイコン＋新規タブ）。PC 2列 / スマホ 1列。「すべて見る」→ `/history`。
- `lib/automation-first/artifact-type.ts`(+test): ラベルの拡張子から種別判定（API変更なし）。

### 改善理由
強み「成果物まで完成させる」がホーム下部のテキストリストに埋もれていた。完成物を上位に・視覚的に出し、1タップで開けるようにした。

### テスト / 確認
- tsc / eslint OK、`vitest lib/automation-first ...` 77件 OK、CI ban n02/n03/n07/p1-09 pass。
- `/dev/automation-first-preview` で ops API を Playwright でモックし、スマホ/PC/ダークを確認（`verification-screenshots/home-core/deliverables-*.png`）。見出し順も DOM で確認。
- 撮影後の微修正（「その他」バッジ背景・外部リンクアイコン）は型/テストのみ確認、再撮影なし。

### 次に最も価値が高い改善
1. 実行中→完了を検知した時の完了モーション（`components/motion/completion-moment.tsx` 再利用、AIコアと連動）。
2. `WorkCountStrip` と AIコアの情報重複の整理。
3. 旧ホーム `secretary-home-dashboard.tsx` の利用有無を確認し、不要なら整理候補に。

### 触るファイル
`components/automation-first/automation-first-home.tsx`, `home-status-core.tsx`, `lib/automation-first/home-core-state.ts`, `components/motion/completion-moment.tsx`

---

## 2026-09-23 — ホーム「AIコア」ステータス

### MINERVOT の強み（現状コードから）
1. 依頼 → 成果物（docx/xlsx/pdf/pptx）まで完成させる（deliverables パイプライン）
2. 一度頼んだ仕事を定期自動化（特に毎日のX投稿、承認後実行）
3. 実行状況・手順進捗が見える（RunningSteps / Timeline / 対応が必要）
4. 使うほど覚える（memory-apply / learned jobs）
5. 失敗・未確認を偽装しない信頼設計（soft-success / fabrication 禁止CI）

### 最大の問題（UX）
1. ホーム上部が静的テキストで、「今MINERVOTが動いているか」が一目で分からない（→今回対応）
2. ホームの情報量が多く、状態の優先度（要対応 > 実行中 > 予定）が上から読めない
3. 見出しの `aria-labelledby` が id 未設定で壊れていた（→今回修正）
4. 強み1（成果物）がホームで「最近完成したもの」リストの奥にしかない
5. 既存テスト1件が main でもタイムアウト（phase2 runNow）

### 今回変更したもの
- `lib/automation-first/home-core-state.ts`(+test): 実データ（要対応数・実行中数・次回実行・預かり件数・読込中）だけから状態を決定。優先度 checking > attention > running > scheduled > idle。
- `components/automation-first/home-status-core.tsx`: 小さなオーブ＋1行ステータス。`role=status`/`aria-live=polite`。要対応は該当セクションへスクロール、実行中/予定は `/today` へ。
- `app/globals.css`: `.home-core*`。transform/opacity のみ、状態でテンポと色が変化（待機=ゆっくり呼吸、実行中/確認中=軌道リング回転、要対応=琥珀色で速め、予定=ゴールド）。`motion-lite` と reduced-motion で停止。
- `automation-first-home.tsx`: ヘッダー直下に配置（リピーター or 読込中のみ。新規ユーザーは従来の導線を優先）。
- `page-header.tsx`: `SectionHeader` に `id` を追加し、壊れていた `aria-labelledby` を修正。

### 改善理由
「AIが内部で動いている」を装飾ではなく**実状態の可視化**として表現。ホームを開いた瞬間に「任せた仕事が今どうなっているか」が分かる。

### 機能評価（AGENTS.md）
機能名: ホームAIコア / ユーザー価値: 状況把握の手間削減 / 繰り返し作業の削減: 一部（毎回の画面巡回が減る） / AI必要度: なし / AIなしで実装可能: はい / 運営・外部APIコスト: 0（既存取得データを再利用、追加API呼び出しなし） / 優先度: 高

### テスト結果
- `tsc --noEmit` OK、eslint OK、`vitest lib/automation-first lib/motion components/automation-first` 54件 OK。
- CI ban: n02 / n07 / p1-09 pass。
- 既存失敗: `lib/work-asset/phase2.test.ts` 1件（main でも同様に失敗、本変更と無関係）。

### Preview / 画面確認
- ローカル dev `/dev/automation-first-preview`（手順は CLAUDE.md）。PC 1280px / スマホ 390px / light / dark を確認。実行中状態で rAF 60fps。
- スクショ: `verification-screenshots/home-core/`
- Vercel Preview: ブランチ push 後に自動生成（Vercel連携がある場合）。

### 未解決
- ホーム全体の情報階層（問題2）。
- 完了した瞬間の状態遷移（running → idle）で `CompletionMoment` を使った一瞬のフィードバックはまだ無い。

### 次に最も価値が高い改善
1. ホーム「今日のMINERVOT」セクションの優先度整理：要対応 → 実行中 → 最近完成したもの（成果物）を上位へ、統計類は下位へ。
2. 最近完成したもの＝成果物カード化（ファイル種別アイコン・ダウンロード直行）で強み1を前面に。
3. AIコアで実行中→完了を検知した時に軽い完了モーション（`components/motion/completion-moment.tsx` 再利用）。

### 触るファイル
`components/automation-first/automation-first-home.tsx`, `components/automation-first/home-status-core.tsx`, `lib/automation-first/home-core-state.ts`, `components/automation-first/your-work.tsx`, `app/globals.css`
