# 追加設計: AI Decision Engine / Dynamic Workflow Planner

> 親設計: [`secretary-execution-redesign.md`](./secretary-execution-redesign.md)  
> 正: [`ATLAS_RULES.md`](../../ATLAS_RULES.md)  
> 方針: Work → Step → 実行 → 完了 は維持。**Step をユーザーに設定させない。** AI が手順を考え、ユーザーは意図と承認だけ行う。

---

## 【ATLAS機能評価】

機能名：AI Decision Engine + Dynamic Workflow Planner（秘書が手順を決める層）

ユーザー価値：ユーザーは「何をしたいか」だけ伝え、実行手段（形式・連携・順序）を考えなくてよい。承認後に仕事が完了まで進む

差別化：チャットAIはユーザーがプロンプトと手順を設計する。MINERVOT は秘書が手順を提案・実行し、完了証拠まで持つ

繰り返し作業の削減：はい — 毎回の形式選択・連携選択・手順組み立てが消える。類似仕事は Smart Template でさらに減る

AI必要度：中〜高 — 依頼解析と Workflow 生成に AI。接続状態判定・承認ゲート・リトライ・スケジュール・証拠検証は非 AI

AIなしで実装可能：一部 — ルールベースの外部サービス推定（既存 `inferRequiredExternalServices`）で最低限は可能。曖昧依頼・最適組み合わせは AI

運営コスト：依頼1件あたり「計画生成」1回 +（必要時）本文生成。エコ時はルール優先、AI 計画は信頼度が低いときだけ。計画キャッシュ（類似依頼）で再計画を抑制

外部APIコスト：有 — LLM（計画）+ 既存生成 + 連携 API（承認後のみ）

コスト削減案：

- [x] エコモード — 定型/類似仕事はルール or 前回 Workflow 再利用
- [x] まとめて生成 — 週次など計画段階でバッチ化を提案
- [x] キャッシュ — 同一/類似 assignment の Workflow 再利用
- [x] 予約実行 — 定期は計画をテンプレ化し毎回フル AI 計画しない
- [x] AI起動条件 — 接続済みサービス・添付有無で分岐。不要な vision/search を起動しない
- [x] 外部API最小化 — 送信/保存は承認後。計画段階では接続状態の読み取りのみ
- [x] 承認後実行 — 既定。危険ステップは必ず gate
- [x] 再生成禁止 — 承認済み計画・成功ステップの証拠がある場合はスキップ

優先度：P0（体験差別化の中核。ただし実装は親設計 Phase 2 以降に載せる）

---

## 1. 追加コンセプト（一言）

| ユーザーが決めること | AI秘書が決めること |
|---------------------|-------------------|
| 何をしたいか（意図） | 必要な Step |
| 承認 / 差し戻し | 使う AI・形式・外部サービス |
| （任意）修正指示 | 成果物・通知方法・完了条件 |

固定 Step ウィザードは禁止。  
「Word を作るボタンを押す」設計から、「営業資料を取引先へ送って」と頼む設計へ。

### 1.1 体験フロー

```
依頼（意図だけ）
  ↓
AI Decision Engine（必要能力の判定）
  ↓
Dynamic Workflow Planner（Step 列の生成）
  ↓
Smart Template 照合（前回類似があれば提案）
  ↓
実行計画の提示（ユーザー向け日本語）
  ↓
承認（または「前回と同じ流れで」一括承認）
  ↓
自動実行（各 Step + 証拠）
  ↓
報告（通知 + 履歴 + 実行証跡）
```

---

## 2. Capability Registry（将来サービスを差し込める設計）

AI に「Slack を使え」とハードコードしない。  
**能力（Capability）カタログ**を持ち、Decision Engine がカタログから選ぶ。

### 2.1 Capability 定義（コード上の契約）

```ts
type WorkCapabilityId =
  | "artifact.word"
  | "artifact.excel"
  | "artifact.pdf"
  | "artifact.slides"
  | "artifact.markdown"
  | "sense.vision"
  | "sense.web_search"
  | "store.google_drive"
  | "store.dropbox"
  | "store.onedrive"
  | "store.notion"
  | "comms.email_gmail"
  | "comms.email_outlook"
  | "comms.slack"
  | "comms.teams"
  | "comms.discord"
  | "comms.line"
  | "social.x"
  | "calendar.google"
  | "calendar.outlook"
  | "notify.in_app"
  | "notify.web_push"
  | "notify.line"
  | "memory.history"
  | "memory.audit_trail";

type WorkCapability = {
  id: WorkCapabilityId;
  labelJa: string;
  category: "artifact" | "sense" | "store" | "comms" | "social" | "calendar" | "notify" | "memory";
  /** 実装アダプタ（未実装なら planned） */
  status: "ready" | "beta" | "planned";
  /** 外部接続が必要か */
  requiresConnection?: ExternalServiceId | "line" | "stripe";
  /** 実行前にユーザー承認が必要か */
  requiresApproval: boolean;
  /** Decision Engine が参照するヒント語（非 AI フォールバック用） */
  hintPatterns: RegExp[];
};
```

### 2.2 初期カタログ（2026 時点）

| Capability | 実装状況（目安） | 承認 |
|------------|------------------|------|
| artifact.* | ready（既存 Deliverables） | 原則不要 |
| sense.vision | ready | 不要 |
| sense.web_search | 既存 research に準拠 | 不要 |
| store.google_drive / dropbox | 一部 ready | 保存先明示時は確認可 |
| store.onedrive / notion | planned / 一部 | 要 |
| comms.email_gmail | 一部 | **要** |
| comms.slack / teams / discord / outlook | planned | **要** |
| social.x | ready（承認フローあり） | **要** |
| calendar.* | planned | **要** |
| notify.* | ready（in-app/LINE/push） | 不要 |
| memory.* | ready（projects / work memory） | 不要 |

**未実装 Capability を計画に入れた場合の扱い:**

1. 計画 UI で「準備中のため、代替案」を提示（例: Drive 未接続 → アプリ内保存のみ）  
2. または「接続が必要です」カードを出し、接続後に同じ計画で再開  
3. 黙ってスキップして completed にしない（Done 改ざん禁止）

### 2.3 アダプタ境界

```
Decision Engine  →  capability ids
Workflow Planner →  steps[{ capabilityId, inputs, approval }]
Step Runner      →  capabilityAdapters[id].execute(ctx)
```

新サービス追加 = Capability 1 行 + Adapter 1 本。  
Orchestration / Deliverable コアは触らない。

---

## 3. AI Decision Engine

### 3.1 入力

- `assignment`（意図）
- 添付メタ（画像/PDF/Excel 有無）
- Work Memory（癖・修正・前回承認）
- 接続済みサービス一覧（非 AI）
- 実行レベル（approve_then_run / full_auto 等）
- エコモード / コスト予算

### 3.2 出力（構造化 JSON・スキーマ固定）

```json
{
  "intentSummaryJa": "営業資料を作成し取引先へメール送付する",
  "capabilities": [
    { "id": "artifact.word", "needed": true, "reasonJa": "提案資料の本文" },
    { "id": "artifact.pdf", "needed": true, "reasonJa": "送付用に固定レイアウト" },
    { "id": "comms.email_gmail", "needed": true, "reasonJa": "取引先へ送付" },
    { "id": "store.dropbox", "needed": false, "reasonJa": "依頼に保存指定なし" },
    { "id": "sense.vision", "needed": false, "reasonJa": "添付画像なし" },
    { "id": "notify.in_app", "needed": true, "reasonJa": "完了報告" },
    { "id": "memory.history", "needed": true, "reasonJa": "仕事履歴" },
    { "id": "memory.audit_trail", "needed": true, "reasonJa": "実行証跡" }
  ],
  "openQuestions": [],
  "confidence": 0.86,
  "similarWorkId": "work_xxx"
}
```

### 3.3 ハイブリッド判定（コストと品質）

```
1) ルール層（非 AI）
   - 添付あり → vision 候補
   - 「毎週/毎日」→ recurring
   - 「送って/投稿」→ comms/social + requiresApproval
   - 接続状態で実行可否を先に確定
2) AI 層（必要なときだけ）
   - ルール confidence が低い
   - 複数形式の競合（Word vs Excel）
   - 宛先・保存先が曖昧
3) Memory 層
   - 類似仕事があれば capabilities を前回計画で初期化
```

**禁止:** ユーザーに Capability チェックボックスを並べて選ばせる UI。  
例外: 承認画面で「今回はメール送付を外す」など **計画の軽微編集** は可（上級者向け折りたたみ）。

### 3.4 既存コードへの載せ方

- 拡張点: `lib/commander/classify.ts` / `plan.ts` / `select-ais.ts`  
- 新規: `lib/works/decision-engine/`（ルール + AI スキーマ）  
- 既存 `inferRequiredExternalServices` を Capability ルールの一部として再利用  
- Planner/Orchestrator 本体は変更せず、**計画結果を metadata / work_steps に載せてから**実行

---

## 4. Dynamic Workflow Planner

### 4.1 原則

- **固定 Step 禁止**（万能 5 手順テンプレを全仕事に当てはめない）  
- 毎回（または類似再利用時）Workflow を生成  
- ユーザー向け表示は日本語の実行計画。内部 step_key / capabilityId は隠す

### 4.2 Workflow オブジェクト

```ts
type DynamicWorkflow = {
  version: 1;
  workId: string;
  intentSummaryJa: string;
  steps: Array<{
    stepKey: string;          // gather | generate_docx | export_pdf | send_email | ...
    labelJa: string;          // ユーザー表示
    capabilityId: WorkCapabilityId;
    dependsOn: string[];
    approvalRequired: boolean;
    inputs: Record<string, unknown>;
    doneEvidence: Array<"artifact_url" | "storage_path" | "message_id" | "tweet_id" | "notify_ack" | "history_id" | "audit_id">;
  }>;
  notifyChannels: Array<"in_app" | "line" | "web_push">;
  similarWorkProposal?: {
    workId: string;
    promptJa: "前回と同じ流れで実行しますか？";
  };
};
```

### 4.3 生成例

依頼:「営業資料を作って取引先へ送って」

| # | labelJa | capability | 承認 | 証拠 |
|---|---------|------------|------|------|
| 1 | ご依頼内容を確認 | memory/history | | |
| 2 | 資料を作成（Word） | artifact.word | | artifact |
| 3 | 送付用 PDF を用意 | artifact.pdf | | artifact |
| 4 | メール送付の承認待ち | comms.email_gmail | **要** | |
| 5 | 取引先へメール送付 | comms.email_gmail | | message_id |
| 6 | 仕事履歴へ保存 | memory.history | | history_id |
| 7 | 実行証跡を保存 | memory.audit_trail | | audit_id |
| 8 | 完了をお知らせ | notify.in_app | | notify_ack |

Dropbox は依頼に無いので **入れない**（過剰実行禁止）。  
ユーザーが過去に「営業資料は必ず Dropbox にも保存」と矯正していれば Memory 層が追加する。

### 4.4 承認 UX（計画承認）

```
┌────────────────────────────────────────┐
│ このようにお進めしてよろしいですか？      │
│                                        │
│ ・営業資料を Word で作成                 │
│ ・送付用に PDF 化                        │
│ ・登録済みの取引先宛にメール送付（要承認） │
│ ・完了後、アプリ内でお知らせ              │
│                                        │
│ [この計画で実行]  [内容を調整]  [取消]    │
│                                        │
│ ※前回の類似仕事あり                      │
│ [前回と同じ流れで実行]                   │
└────────────────────────────────────────┘
```

`full_auto` かつ危険ステップ無しのときだけ、計画承認を省略可。  
送信・投稿・削除を含む計画は **常に承認**（既存安全規則）。

---

## 5. 学習機能（Work Memory / Learning との接続）

### 5.1 学習する対象（会話ではなく仕事）

| シグナル | 保存先 | 次回への使い方 |
|---------|--------|----------------|
| 計画への修正（PDF不要、など） | Work Memory | Decision の prior |
| 承認/却下 | Learning + Work Memory | 危険ステップの既定 |
| 完成後の手直し | Work Memory corrections | 生成プロンプト/トーン |
| よく使う宛先・フォルダ | Work Memory | Capability inputs 初期値 |
| 失敗ステップ | reliability + Learning | 計画から避ける/確認を厚く |

### 5.2 改善ループ

```
仕事完了
 → 何を直したか抽出（非 AI 差分 + 必要なら要約 AI）
 → Work Memory 候補（ユーザー確認後に定着可）
 → 類似検出インデックス更新
 → 次回 Decision の prior に注入
```

「毎回ゼロから計画」しない。  
ただし prior と今回依頼が矛盾したら **今回の依頼を優先**し、計画に「前回と違う点」を明示する。

---

## 6. Smart Templates

### 6.1 類似検出（プログラム優先）

特徴量（例）:

- 正規化した assignment embedding（AI、エコ時はスキップ可）  
- テンプレ ID / キーワード集合  
- 使った capability 集合  
- 添付タイプ  

閾値超で:

> 以前の「週次営業レポート」と似ています。前回と同じ流れで実行しますか？

選択肢:

1. 前回と同じ流れで実行（Workflow 再利用、再計画 AI なし）  
2. 計画だけ見直す（Decision 再実行）  
3. 新規として進める  

### 6.2 テンプレの自動成長

成功＋ユーザー満足（明示/再修正なし）の Work は、候補テンプレへ。  
ユーザーが「テンプレにする」を押さなくても、3 回同型なら提案（通知1回、しつこい提案禁止）。

---

## 7. 完了の定義（Done）— 強化版

成果物生成だけでは **Done にしない**。

依頼に含まれるゴールに応じ、以下の証拠が揃って初めて `completed`:

| 要件 | 証拠例 |
|------|--------|
| 成果物生成 | storage URL / sha256 / MIME 検証 |
| 保存（外部指定時） | folder path / file id |
| 送信（指定時） | message_id / 宛先ハッシュ |
| 投稿（指定時） | tweet_id / permalink |
| 通知 | notify ack / delivery status |
| 履歴保存 | project id / work id |
| 実行証跡 | step evidence JSON / reliability event |

不足時は `partially_completed` または `waiting_approval` / `failed`。  
UI に「何が未完了か」を日本語で出す。

---

## 8. DB / API 追加（親設計への差分）

### 8.1 DB 追加フィールド

`atlas_works` / domain payload に:

```json
{
  "decision": { "capabilities": [], "confidence": 0.0, "model": null },
  "workflow": { "version": 1, "steps": [] },
  "workflowSource": "ai" | "rules" | "similar_reuse" | "user_adjusted",
  "planApprovedAt": null,
  "similarWorkId": null
}
```

`atlas_work_steps.evidence` に capability ごとの完了証拠。  
`atlas_work_capability_runs`（任意）で将来の監査を分離しても良い。

### 8.2 API 追加

| Method | Path | 役割 |
|--------|------|------|
| POST | `/api/works` | 受付 → 非同期で decision+plan まで進める |
| GET | `/api/works/:id/plan` | 実行計画の取得 |
| POST | `/api/works/:id/plan/approve` | 計画承認 → 実行開始 |
| POST | `/api/works/:id/plan/adjust` | 軽微修正（capability の on/off 等） |
| POST | `/api/works/:id/plan/reuse-similar` | 類似 Workflow で承認相当 |
| GET | `/api/capabilities` | ready/planned 一覧（接続状態付き） |

ユーザーに Step 編集キャンバスは **出さない**（内部デバッグ画面のみ）。

---

## 9. UI 差分

1. ホームから形式セレクタを主位置から除去（親設計どおり）  
2. 依頼直後は「進め方を考えております」  
3. **実行計画カード**（承認が主 CTA）  
4. 承認後は Step 進捗（秘書が決めた手順の再生）  
5. 完了カードは「生成ファイル」だけでなく「送付済み / 保存済み / 通知済み」

---

## 10. 実装ロードマップ（親 Phase への差し込み）

| Phase | 内容 | AI |
|-------|------|----|
| 0 | 親設計 + 本追加設計（ドキュメント） | — |
| 1 | UI を仕事中心へ。計画 UI の箱だけ（中身はルール計画） | 低 |
| 2 | Capability Registry + ルール Decision + `/plan` API | 不要〜低 |
| 2.5 | AI Decision（構造化 JSON）+ 承認ゲート | 中 |
| 3 | Done 証拠の必須化（送信/保存/通知/履歴/証跡） | 不要 |
| 4 | Smart Templates（類似検出・再利用） | 中（embedding は任意） |
| 5 | Learning の prior 注入を Decision に接続 | 中 |
| 6 | planned Capability（Slack/Teams/…）を Adapter 追加で順次 ready 化 | 連携次第 |

各 Phase はユーザー確認後に次へ。

---

## 11. 変更禁止と差し込み口（再掲）

触らない: Planner / Deliverable / Automation 本体、eco 既存挙動、User Profile コア。  
足す: `lib/works/decision-engine/`, `lib/works/capability-registry/`, Commander 前後、UI、通知、completion evidence adapter。

---

## 12. 成功指標（追加）

1. 新規依頼の ≥80% でユーザーが形式を手動選択しない  
2. 送信・保存を含む依頼で、計画承認なしに外部実行されない  
3. 類似仕事の再利用提案が的中し、再計画 AI を省略できる  
4. `completed` のすべてに通知・履歴・証跡証拠がある  
5. 「Step を自分で組む画面」がプロダクトに存在しない
