# 実行型AI秘書リデザイン設計書

> 正: [`ATLAS_RULES.md`](../../ATLAS_RULES.md)  
> 評価: [`feature-evaluations/secretary-execution-redesign.md`](./feature-evaluations/secretary-execution-redesign.md)  
> 方針: **新規で第二のパイプラインを作らない。** 既存 Commander / Work Jobs / Automations / Notifications / Deliverables を「仕事完了」定義で束ね直す。

---

## 0. 一文定義

MINERVOT は AIツール集ではない。  
**「仕事を任せるなら MINERVOT」** — 依頼された仕事を、必要な手段を自動で組み合わせて最後まで実行する、あなた専属のAI秘書である。

| ではないもの | であるもの |
|-------------|-----------|
| ChatGPT の代替チャット | 実行する秘書 |
| Word/PDF/Excel 作成ツール | 仕事完了エンジン |
| モデルを選ばせる UI | ユーザーは依頼と確認だけ |
| 途中操作の多いウィザード | 待つ → 通知 → 確認 |

---

## 1. As-Is（現状）とギャップ

### 1.1 すでに強い基盤（再利用）

```
依頼(Home/Workspace)
  → POST /api/work/jobs (202)
  → Commander (分類・確認・外部サービス事前確認)
  → Orchestration (Planner/Worker/QA) ※コアは触らない
  → Deliverable 生成 ※コアは触らない
  → projects 保存
  → 通知 → /results/:notificationId
```

定期:

```
Automation 定義
  → /api/automations/tick
  → atlas_automation_jobs (claim/retry/evidence)
  → orchestrate
  → 通知 / 承認待ち(X等)
```

### 1.2 ツール集に見える原因（UI/完了定義）

1. ホームに **成果物形式（Excel/Word/PDF）** セレクタが並び、「作る形式」が主役に見える  
2. 単発ジョブの進捗が粗く（queued/running/completed）、**何をしているか**が見えない  
3. 完了条件が「生成成功」寄りで、**送信・保存・提出**までを仕事に含めにくい  
4. 単発（`atlasWorkJobs`）と定期（`atlas_automation_jobs`）で **状態機械が分裂**  
5. ユーザー向け文言に「成果物」が残る（`ATLAS_RULES` では避ける用語）

### 1.3 ギャップ一覧

| あるべき体験 | 現状 | 対応方針 |
|-------------|------|---------|
| 仕事を依頼する | 依頼 UI はあるが形式選択が目立つ | UI を仕事中心へ |
| AIが処理を組み合わせる | Commander + Orchestration あり | ステップグラフを明示・記録 |
| 待つ | `after()` + ポーリング | 単発も durable job 証拠へ寄せる |
| 完了通知 | 強い（in-app/LINE/push） | 結果導線を仕事単位に統一 |
| 成果確認 | あり（Word 改訂は強い） | 全形式で確認/承認/やり直し |
| 定期実行 | Automations あり | 依頼画面から「毎回やる」へ昇格 |
| 複製・テンプレ | Automation templates 一部 | 仕事テンプレを第一級に |
| 途中停止/再開 | Commander cancel / job cancel 一部 | 統一 API |
| 承認フロー | 危険操作・X・execution level | 完了前ゲートを仕事ステップ化 |

---

## 2. To-Be ユーザー体験

### 2.1 主画面：「仕事を依頼する」

ユーザーが最初に見るのは形式ボタンではなく、**仕事の依頼**。

```
┌─────────────────────────────────────────┐
│  MINERVOT（AI秘書）                      │
│                                         │
│  今日の仕事 / 進行中                      │
│  ・営業レポート（実行中・ステップ3/5）     │
│  ・請求書送付（承認待ち）                 │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ 何をお任せしますか？                 │  │
│  │ 例：毎週月曜9時に営業レポートを作成し │  │
│  │     共有フォルダへ保存する            │  │
│  │                         [添付] [依頼] │  │
│  └───────────────────────────────────┘  │
│                                         │
│  よく任せる仕事（テンプレート）            │
│  ・週次営業レポート  ・日次売上Excel      │
│  ・請求書PDF送付                          │
└─────────────────────────────────────────┘
```

形式選択は **折りたたみの「仕上げの希望（任意）」** に退避する。  
デフォルトは AI秘書が仕事内容から判断（既存 `preferredDeliverableFormat: "auto"`）。

### 2.2 完了の定義（Done Definition）

1つの仕事 = 依頼文に含まれるゴールまでの到達。

例:

| 依頼 | Done |
|------|------|
| 毎週月曜9時に営業レポートを作成 | 生成 +（指定があれば）保存/共有 + 完了通知 |
| 毎日18時に売上をExcelへまとめる | Excel 更新/生成 + 保存先反映 + 通知 |
| 毎月請求書をPDF化して送信 | PDF 生成 + 送信（承認後）+ 送信証拠 + 通知 |

「ファイルがダウンロード可能」だけでは Done にしない。  
依頼に外部アクションが含まれる場合、**そのアクションの完了証拠**が必須（既存 `completion-evidence` 思想を単発にも適用）。

### 2.3 ユーザー操作の最小化（MINERVOT原則）

1. クリックを減らす — 形式選択・中間ウィザードを減らす  
2. 判断を秘書がする — ステップ分解・形式・連携先推定  
3. 毎回の入力を覚える — Work Memory / テンプレ  
4. 次ボタンを予測し自動実行 — 定期化提案、再実行  
5. 操作ではなく完了 — UIの主語は「仕事」

---

## 3. 論理アーキテクチャ（変更禁止コアを守る）

```
                    ┌──────────────────────┐
   UI / API         │  Work Request Layer  │  ← 今回の主戦場
                    │  (依頼・進捗・確認)    │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │ Secretary Orchestrator│  ← Commander 拡張（新パイプライン禁止）
                    │ plan / confirm / run  │
                    └──────────┬───────────┘
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
        Work Memory      Step Runner      Notifications
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
        Orchestration*   Deliverables*   Integrations
        (触らない本体)    (触らない本体)   (adapter)
                               │
                    ┌──────────▼───────────┐
                    │  Job Reliability     │  ← automation jobs 基盤を単発へ共用
                    │  retry / evidence     │
                    └──────────────────────┘
```

\* Planner / Deliverable / Automation Workflow **本体は直接変更しない**（`AGENTS.md`）。  
完了定義・ステップ記録・UI・Commander 前後・Job 証拠層で拡張する。

---

## 4. データモデル設計

### 4.1 第一級エンティティ: Work（仕事）

ユーザーが作る単位は「成果物」ではなく **Work**。

推奨テーブル（新規 migration、`create if not exists`）:

```sql
-- 概念: ユーザーが依頼した仕事（単発・定期の親）
create table if not exists public.atlas_works (
  id text primary key,                    -- work_<id>
  user_id text not null,
  title text not null,                    -- 表示名（秘書が要約）
  assignment text not null,               -- 元の依頼文
  status text not null,                   -- see §4.3
  schedule_kind text not null default 'once', -- once | recurring
  automation_id text,                     -- 定期の場合
  template_id text,
  preferred_format text,                  -- auto|docx|xlsx|pdf|...
  requires_approval boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists atlas_works_user_updated_idx
  on public.atlas_works (user_id, updated_at desc);

create table if not exists public.atlas_work_runs (
  id text primary key,                    -- run_<id> / 既存 work job id と対応可
  work_id text not null references public.atlas_works(id),
  user_id text not null,
  status text not null,
  current_step text,
  progress_percent integer not null default 0,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  idempotency_key text,
  commander_run_id text,
  project_id text,
  artifact_ids jsonb not null default '[]'::jsonb,
  last_error_code text,
  last_error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.atlas_work_steps (
  id text primary key,
  run_id text not null references public.atlas_work_runs(id),
  step_key text not null,                 -- understand|vision|generate|export|save|send|notify|...
  label_ja text not null,
  status text not null,                   -- pending|running|succeeded|failed|skipped|waiting_approval|cancelled
  attempt_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  evidence jsonb not null default '{}'::jsonb, -- url, messageId, storagePath, sha256...
  error_code text,
  error_message text,
  sort_order integer not null default 0
);

create table if not exists public.atlas_work_templates (
  id text primary key,
  user_id text not null,                  -- または system テンプレは __system__
  title text not null,
  assignment_template text not null,
  default_schedule jsonb,
  default_steps jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

RLS: 既存方針どおり deny-all for anon/authenticated。書き込みは service role。

### 4.2 当面の段階導入（DDL 前でも動かす）

Production に Postgres URL が無い場合があるため、**Phase 0 は `atlas_user_state` domain で先行**:

| domain | 用途 |
|--------|------|
| `atlasWorks` | Work 一覧・状態 |
| `atlasWorkRuns` | Run（既存 `atlasWorkJobs` を包む/移行） |
| `atlasWorkTemplates` | テンプレ |

専用テーブル migration は `billing-schema` と同様の apply 経路を用意する。  
既存 `atlasWorkJobs` / `atlasCommanderRuns` / `atlas_automation_jobs` は破壊せず、Work から参照する。

### 4.3 統一ステータス

```
draft
→ queued
→ running
→ waiting_approval   -- 送信/公開/削除など
→ retrying
→ partially_completed
→ completed
→ failed
→ cancelled
→ paused             -- 途中停止
```

単発・定期の表示をこの語彙に揃える（内部 enum は adapter でマップ）。

### 4.4 ステップ語彙（ユーザー向けは日本語1行）

| step_key | 表示例 |
|----------|--------|
| understand | ご依頼内容を確認しています |
| gather | 資料・画像を読み取っています |
| plan | 進め方を組み立てています |
| generate | 資料を作成しています |
| export | ファイルを整えています |
| save_external | 保存先へ預けています |
| send | お送りする準備／送信しています |
| publish | 公開・投稿しています |
| notify | 完了をお知らせしています |
| await_approval | ご承認をお待ちしています |

内部の Planner/Worker 詳細・モデル名は見せない。

---

## 5. API 設計

### 5.1 新規（薄いファサード — 既存実装を呼ぶ）

| Method | Path | 役割 |
|--------|------|------|
| POST | `/api/works` | 仕事を依頼（once / recurring を受け付け） |
| GET | `/api/works` | 進行中・完了一覧 |
| GET | `/api/works/:id` | 仕事詳細 + 最新 run + steps |
| POST | `/api/works/:id/cancel` | 途中停止 |
| POST | `/api/works/:id/resume` | 再開 |
| POST | `/api/works/:id/retry` | 失敗からの再実行（同じ壊れた入力をそのまま送らない） |
| POST | `/api/works/:id/duplicate` | ジョブ複製 |
| POST | `/api/works/:id/approve` | 承認フロー続行 |
| POST | `/api/works/:id/reject` | 差し戻し・修正指示 |
| GET | `/api/works/:id/runs/:runId` | run + steps 進捗 |
| GET/POST | `/api/work-templates` | テンプレ CRUD |
| POST | `/api/work-templates/:id/start` | テンプレから依頼 |

### 5.2 既存 API との関係（破壊的置換禁止）

| 既存 | 扱い |
|------|------|
| `POST /api/work/jobs` | `/api/works` 内部から呼ぶ。互換維持 |
| `GET /api/work/jobs/:id` | Run ポーリング互換。UI は `/api/works/:id` へ移行 |
| `POST /api/commander` | 危険操作の確認 UI 用に維持 |
| `/api/automations*` | recurring Work の実体。Work.schedule_kind=recurring 時に作成/紐付け |
| `/api/notifications*` | 完了通知の正。Work 完了時に `targetType=work` を追加 |
| `/api/deliverables*` | ステップ `export` の実装詳細。UI から直接「作る」導線は縮小 |

### 5.3 POST `/api/works` リクエスト例

```json
{
  "assignment": "毎週月曜日9時に営業レポートを作成し、共有フォルダへ保存する",
  "schedule": { "kind": "recurring", "cronHint": "毎週月曜 09:00", "timezone": "Asia/Tokyo" },
  "attachments": [],
  "preferences": { "format": "auto" },
  "executionLevel": "approve_then_run",
  "templateId": null,
  "idempotencyKey": "client-uuid"
}
```

レスポンス: `202` + `{ workId, runId, status: "queued" }`

---

## 6. 秘書オーケストレーター設計

### 6.1 役割分担（再定義）

| 層 | 役割 | AI? |
|----|------|-----|
| Work Request Layer | 受付・一覧・進捗・承認 UI/API | 不要 |
| Secretary Orchestrator (Commander+) | 依頼理解、ステップ列挙、確認、実行指揮 | 判断のみ |
| Step Runner | 各ステップ実行・証拠記録・リトライ分類 | ステップ依存 |
| Orchestration 本体 | 文章・資料の中身生成 | 既存どおり |
| Deliverables 本体 | バイナリ生成・検証 | 既存どおり |
| Integrations adapters | Drive/Dropbox/Mail/X… | 不要（API） |
| Reliability | スケジュール・ハング検知・backoff | 不要 |

### 6.2 ステップ組み立てアルゴリズム（プログラム優先）

1. 正規表現/ルールで外部アクション語を検出（送信、投稿、保存、提出、毎週、毎日…）  
2. 添付があれば `gather/vision` を必須化（既存 vision gate）  
3. 生成が必要なら `generate` + `export`  
4. 外部アクションがあれば対応ステップを末尾に追加し、危険なら `await_approval` を挿入  
5. 最後に必ず `notify`  
6. 曖昧なときだけ AI に「ステップ候補 JSON」を尋ねる（エコモードではルールのみ）

AI にスケジュール計算・リトライ判定・ON/OFF をさせない。

### 6.3 複数AI連携（ユーザーには見せない）

裏側で vision / 文章生成 / 分類を使い分けてよい。  
ユーザー向けは常に「MINERVOT / AI秘書」一人。モデル名非表示（既存ルール）。

### 6.4 自動リトライ / 失敗ログ

単発 Run も automation jobs と同じ分類器を使う:

- retryable: 408/429/5xx/timeout/network → 1m / 5m / 15m、最大3回  
- non-retryable: auth / 入力不正 / 課金 / キャンセル  

失敗時:

- `atlas_work_steps` に error_code / message / evidence  
- reliability_events へ診断（既存）  
- ユーザー通知は日本語の具体文（内部 request_id は診断のみ）

### 6.5 途中停止・再開

- `paused` / `cancelled` を Work/Run に反映  
- 再開は **成功済みステップをスキップ**（証拠がある step は再実行しない）  
- 生成済みファイルがある場合は再生成禁止（コストルール）

### 6.6 承認フロー

危険ステップ（送信・公開・削除・外部共有・決済）:

1. ステップを `waiting_approval` にする  
2. 通知「ご承認をお願いいたします」  
3. `POST /api/works/:id/approve` で続行  
4. 証拠（messageId / tweetId / storage path）を記録して初めて completed

既存 `executionLevel`（suggest_only / draft_save / approve_then_run / full_auto）を Work に継承。

---

## 7. UI リファクタリング案

### 7.1 画面の主語変更

| 現在の見え方 | 変更後 |
|-------------|--------|
| 成果物形式セレクタが目立つ | 「仕事を依頼する」がヒーロー |
| Word/PDF/Excel を選んでから実行 | 依頼文が先。形式は任意の詳細 |
| Workspace = 生成プレビュー中心 | Workspace = **進行中の仕事** + 確認 |
| Automations が別館 | 「毎回任せる仕事」として依頼画面から連続 |

### 7.2 変更対象（安全な UI 層）

- `components/home/home-chat-bar.tsx` — 形式セレクタを折りたたみ、「仕上げの希望（任意）」へ  
- `components/home/secretary-chat-composer.tsx` — 文言を仕事依頼に統一  
- `components/home/secretary-home-dashboard.tsx` — 「進行中の仕事」「よく任せる仕事」ブロック  
- `components/workspace/workspace-dashboard.tsx` — ステップ進捗表示（`atlas_work_steps`）  
- `components/workspace/final-output.tsx` — 「完成した資料」表記、確認/承認 CTA  
- `components/automations/*` — 「定期の仕事」トーンへ（本体ロジックは触らない）

### 7.3 進捗 UI

```
営業レポート作成
● ご依頼内容を確認 — 完了
● 資料を読み取り — 完了
● 資料を作成 — 実行中
○ 共有フォルダへ保存
○ 完了をお知らせ
```

モデル名、Planner、Worker 名は出さない。

### 7.4 確認画面（仕事のゴール）

通知タップ → `/works/:id`（または既存 `/results/:notificationId` を Work 対応）

- 完成した資料のプレビュー / ダウンロード  
- 外部アクション証拠（「共有フォルダへ保存済み」）  
- [この内容で問題ありません] [修正を依頼] [同じ仕事をもう一度] [毎週の仕事にする]

---

## 8. ジョブ実行基盤の寄せ方

### 8.1 問題

- 単発: `atlasWorkJobs` + Next `after()`  
- 定期: `atlas_automation_jobs` + tick  

### 8.2 方針

1. **表示・進捗・リトライ語彙を統一**（Work/Run/Step）  
2. 単発の実行も tick 経由の drain を将来追加（プロセス死亡に強くする）  
3. 当面は `after()` を残しつつ、ステップ証拠を durable に書く  
4. Automation 本体は触らず、Work が automationId を持つ

### 8.3 完了ゲート（単発にも適用）

既存 automation の `completion-evidence` を単発へ共有する adapter:

- 生成必須なら artifact の storage URL / sha 検証  
- 送信必須なら externalResultId  
- vision 必須なら vision success  
- 承認必須なら approval 記録  

ゲート未充足なら `completed` にしない（`partially_completed` / `waiting_approval` / `failed`）。

---

## 9. テンプレート化・複製

| 操作 | 挙動 |
|------|------|
| ジョブ複製 | 直近 Work の assignment/metadata/steps 骨格をコピーして新 Work（即 queued または draft） |
| テンプレ化 | 成功した Work から `atlas_work_templates` を作成 |
| テンプレ開始 | 変数（期間・宛先）だけ確認して実行 |
| 定期化 | once → recurring。内部で Automation を生成し work.automation_id を結ぶ |

初期システムテンプレ例（UI の「よく任せる仕事」）:

1. 週次営業レポート作成  
2. 日次売上の Excel まとめ  
3. 請求書 PDF 化と送付（承認付き）  
4. 写真のレシート仕分け  
5. SNS 投稿文の下書き（承認後投稿可）

---

## 10. 実装フェーズ（一つずつ）

### Phase 0 — 思想の固定（本 PR）

- `ATLAS_RULES.md` 更新  
- 本設計書 + 機能評価  
- 実装コードの大規模変更はしない

### Phase 1 — UI の主語を「仕事」へ（コア非接触）

- ホーム文言・形式セレクタ折りたたみ  
- 「進行中の仕事」リスト（既存 jobs/projects 読み取り）  
- 「成果物」ユーザー文言の置換

### Phase 2 — Work ファサード API + ステップ進捗

- `atlasWorks` / runs / steps（domain または table）  
- `/api/works*`  
- Workspace 進捗 UI  
- 既存 work/jobs を内部利用

### Phase 3 — 完了定義の拡張

- completion-evidence を単発へ  
- 保存/送信ステップ adapter（承認ゲート）  
- 通知の `targetType=work`

### Phase 4 — テンプレ・複製・定期化 UX

- テンプレ CRUD  
- 「毎週の仕事にする」  
- Automations UI との導線統合（見た目のみでも可）

### Phase 5 — 単発ジョブの durable drain

- tick が queued Work も処理  
- `after()` 依存を縮小

各 Phase はユーザー確認後に次へ（`ATLAS_RULES` §14）。

---

## 11. 変更禁止と安全な差し込み口

### 触らない

- `lib/orchestration/orchestrator.ts` 本体  
- Planner / Worker / QA コア  
- Deliverable engine 本体  
- Automation workflow 実行本体  
- 依頼範囲（execution level）セマンティクスの破壊的変更  
- エコモード既存挙動  
- User Profile / Proactive Suggestions / 今日のダッシュボードコア

### 足してよい

- `lib/works/`（新規ファサード）  
- Commander の前後フック（ステップ記録）  
- `lib/jobs/completion-evidence` の単発 adapter  
- UI / 通知 / metadata  
- `lib/cost-optimization/` の政策  
- Integrations adapter

---

## 12. 成功指標（プロダクト）

1. 新規ユーザーが最初の画面で「形式」より「仕事の依頼」を認識できる  
2. 典型依頼（レポート作成→保存）が、ユーザーの途中操作ゼロで通知まで到達  
3. 失敗時にステップ名と次アクションが日本語で分かる  
4. 「同じ仕事をもう一度」「毎週にする」が各1クリック  
5. 機能提案レビューで「仕事を最後まで実行できるか？」が否なら却下される運用が定着

---

## 13. まとめ

MINERVOT の勝ち筋は、生成品質のチャット競争ではない。  
**依頼を預かり、必要な手段を組み合わせ、完了証拠付きで返し、次も同じ手間を覚えていること**である。

本設計は第二の実行エンジンを増やさない。  
既存の強い Commander / Jobs / Automations / Notifications を、**Work というユーザー語彙と Done Definition** で束ね直す。
