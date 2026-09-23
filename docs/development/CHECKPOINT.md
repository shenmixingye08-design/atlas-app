# CHECKPOINT（最新が先頭）

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
