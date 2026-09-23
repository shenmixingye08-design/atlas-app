# CHECKPOINT（最新が先頭）

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
