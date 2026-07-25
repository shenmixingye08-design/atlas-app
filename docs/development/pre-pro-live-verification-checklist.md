# Vercel Pro 課金前・実機確認手順書（PR #15 前提）

対象リポジトリ: `shenmixingye08-design/atlas-app`  
前提 PR: [#15](https://github.com/shenmixingye08-design/atlas-app/pull/15)

## この文書の使い方

1. **上から順に 1 項目ずつ**確認する（飛ばさない）。
2. 各項目の末尾で `合格 / 不合格 / 未確認` のいずれかに印を付ける。
3. **すべて合格になるまで、Vercel Pro への変更は推奨しない。**
4. 値（秘密鍵・トークン・パスワード）はメモに書かない。設定画面で「入っているか」だけ確認する。

### 事前に用意するもの

| 用意 | 用途 |
| --- | --- |
| Production URL（例: `https://xxxx.vercel.app`） | 実機確認先 |
| GitHub 権限 | PR #15 のマージ確認 |
| Supabase プロジェクト（SQL Editor） | Migration / テーブル確認 |
| Vercel Dashboard（Project → Logs / Env） | 環境変数・Runtime Logs |
| Clerk Dashboard | ログイン方式の確認 |
| ユーザーA用アカウント | 通常確認 |
| ユーザーB用アカウント | 所有権分離確認 |
| Android 実機（Chrome） | Push / ダウンロード |
| X 本番アカウント（Write 権限） | 手動実投稿 |
| Stripe **Test Mode** のカード（`4242…`） | Checkout / Webhook |

### 判定ルール（最終）

| 結果 | 意味 |
| --- | --- |
| 全項目 合格 | Pro 変更の検討に進める（その後も毎分 Cron の本番確認が残る） |
| 1つでも 不合格 / 未確認 | **Pro 変更は推奨しない** |

---

## 1. PR #15 のマージ確認

### 開く画面
- GitHub: `https://github.com/shenmixingye08-design/atlas-app/pull/15`
- Vercel: Project → Deployments（Production）

### 押すボタン
1. PR #15 が **Merged** か確認（未マージなら Merge pull request）
2. Vercel で最新 Production Deployment が **Ready** になるまで待つ
3. Deployment 詳細で Commit が PR #15 マージ後の hash か確認

### 入力する内容
- なし

### 正常時の表示
- PR 状態: `Merged`
- Vercel Production: 最新デプロイ成功
- `vercel.json` の Cron が Hobby 向け日次（`0 0 * * *`）のまま（毎分 `* * * * *` ではない）

### 失敗時に確認する場所
- GitHub Checks / Vercel ビルド失敗ログ
- `vercel.json` が毎分 Cron になっていないか（Hobby だとデプロイ失敗しやすい）

### Vercel Logs で探すログ
- Build 成功メッセージ
- Cron 関連の deploy error（minute schedule rejected 等）

### Supabase で確認するテーブル
- なし（この段階では不要）

### 合格条件
- [ ] PR #15 が main にマージ済み
- [ ] Production デプロイ成功
- [ ] Cron は日次のまま（Pro 前）

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________

---

## 2. 必要な Supabase Migration（ファイル名・適用順）

### 開く画面
- ローカルまたは GitHub: `supabase/migrations/`
- Supabase Dashboard → SQL Editor / Table Editor

### 押すボタン
1. 下表の順に SQL を **未適用なら**実行（既にあればスキップ）
2. Table Editor でテーブルが存在するか確認

### 入力する内容
- 各 `.sql` ファイルの内容を順番に実行（値の改変はしない）

### 適用順（必須）

| 順 | ファイル名 | 主なテーブル |
| ---: | --- | --- |
| 1 | `20260711_atlas_user_state.sql` | `atlas_user_state` |
| 2 | `20260711_atlas_user_state_rls_lockdown.sql` | （RLS 補正） |
| 3 | `20260711_projects.sql` | `projects` |
| 4 | `20260711_projects_rls_lockdown.sql` | （RLS 補正） |
| 5 | `20260713_atlas_billing_subscriptions.sql` | `atlas_billing_subscriptions`, `atlas_stripe_webhook_events` |
| 6 | `20260713_atlas_google_oauth_credentials.sql` | `atlas_google_oauth_credentials` |
| 7 | `20260713_atlas_wordpress_credentials.sql` | `atlas_wordpress_credentials` |
| 8 | `20260713_atlas_x_oauth_credentials.sql` | `atlas_x_oauth_credentials` |
| 9 | `20260720_atlas_x_autopost.sql` | `atlas_x_autopost_settings`, `atlas_x_autopost_runs` |
| 10 | `20260722_atlas_push_subscriptions.sql` | `atlas_push_subscriptions` |
| 11 | `20260722_atlas_automation_jobs.sql` | `atlas_automation_jobs` |

詳細: `docs/development/pre-pro-migrations.md`

### 正常時の表示
- 上表のテーブルがすべて存在する
- RLS が有効で、anon/authenticated が deny-all（service role 前提）

### 失敗時に確認する場所
- SQL Editor のエラーメッセージ
- 途中で止まった順番（その番号からやり直し）

### Vercel Logs で探すログ
- `[persistence]` / Supabase overflow unavailable が Production で頻発していないか

### Supabase で確認するテーブル
- 上表すべて

### 合格条件
- [ ] 11 本が適用順どおり完了（または既に同等スキーマ確認済み）
- [ ] `atlas_push_subscriptions` / `atlas_automation_jobs` / `atlas_x_oauth_credentials` / billing 系が存在

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________

---

## 3. Production に必要な環境変数の一覧

### 開く画面
- Vercel → Project → Settings → Environment Variables（Production）
- 参考一覧: `docs/development/pre-pro-env-vars.md` / `.env.local.example`

### 押すボタン
1. Production スコープで「設定済みか」を1つずつ確認（**値は画面に出さない・メモしない**）
2. 変更したら Redeploy

### 入力する内容（値そのものは書かない）

#### 必須（まずこれがないと全体が動かない）
| 変数名 | 用途 |
| --- | --- |
| `OPENAI_API_KEY` | AI 実行 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk 公開キー（Production は live） |
| `CLERK_SECRET_KEY` | Clerk 秘密鍵（live） |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | ログイン後（例 `/projects`） |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | 登録後 |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL` | ログアウト後 |
| `CLERK_WEBHOOK_SECRET` | Clerk Webhook |
| `NEXT_PUBLIC_SITE_URL` | 公開 URL |
| `NEXT_PUBLIC_APP_URL` | アプリ URL（SITE と同じ本番ドメイン推奨） |
| `ATLAS_OWNER_EMAILS` | Owner 許可メール |
| `CRON_SECRET` | `/api/automations/tick` 認証 |
| `SUPABASE_URL` | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバー永続化（必須級） |
| `NEXT_PUBLIC_SUPABASE_URL` | クライアント用 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | クライアント用 anon |

#### 公開前に必須（特商法）
| 変数名 |
| --- |
| `ATLAS_OPERATOR_BUSINESS_NAME` |
| `ATLAS_OPERATOR_REPRESENTATIVE_NAME` |
| `ATLAS_OPERATOR_ADDRESS` |
| `ATLAS_OPERATOR_CONTACT_EMAIL` |

#### このチェックリストの機能確認に必要
| 変数名 | 用途 |
| --- | --- |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` / `X_REDIRECT_URI` | X 連携・投稿 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push |
| `STRIPE_SECRET_KEY`（**sk_test_**） | Stripe Test Mode |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`（**pk_test_**） | Stripe Test Mode |
| `STRIPE_WEBHOOK_SECRET` | Webhook 署名 |
| `STRIPE_PRICE_LIGHT` / `STRIPE_PRICE_STANDARD` / `STRIPE_PRICE_PREMIUM` | Checkout |

#### 任意だが推奨
| 変数名 | 用途 |
| --- | --- |
| `OAUTH_STATE_SECRET` | OAuth CSRF |
| `ENABLE_SCHEDULED_CRON` | 未設定=有効。緊急時のみ `false` |

### 正常時の表示
- 上の必須が Production に存在
- Clerk / Stripe が **test/live の取り違えなし**（この手順の Stripe は **Test Mode**）
- Owner 画面 `/owner/env-status` で required missing が 0（Owner ログイン後）

### 失敗時に確認する場所
- Vercel Env の Environment が Production か
- Redeploy 忘れ
- `/owner/env-status` の未設定一覧

### Vercel Logs で探すログ
- `CRON_SECRET is not configured`
- Stripe / Clerk production guard の拒否メッセージ

### Supabase で確認するテーブル
- なし（設定有無の確認）

### 合格条件
- [ ] 必須・特商法・X/Push/Stripe Test が Production に設定済み
- [ ] 値をこの手順書に書き写していない

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________

---

## 4. Clerk 実機ログイン確認

### 開く画面
- `https://<本番>/sign-in`
- `https://<本番>/sign-up`
- 保護ページ例: `/projects` `/settings`

### 押すボタン
1. 新規登録（メール）→ ログイン
2. ログアウト
3. 既存ユーザーで再ログイン
4. 未ログインで `/projects` を開き、ログインへ誘導されることを確認
5. ログイン済みで `/sign-in` に戻されないことを確認
6.（Clerk で Google を有効にしている場合のみ）Google ログインも確認。**未設定なら「Googleでログイン」を合格扱いにしない**

### 入力する内容
- ユーザーAのメール / パスワード（または Clerk 有効な方式）

### 正常時の表示
- ログイン後ホーム（または設定済みの after-sign-in）に遷移
- 保護ページが見られる
- ログアウト後は保護ページに入れない

### 失敗時に確認する場所
- Clerk Dashboard → キーが live か / Allowed origins
- Vercel の `NEXT_PUBLIC_CLERK_*` / `CLERK_SECRET_KEY`
- ブラウザの Cookie / サードパーティ Cookie 制限

### Vercel Logs で探すログ
- Clerk 認証失敗・middleware リダイレクト関連

### Supabase で確認するテーブル
- `atlas_user_state`（ログイン後ドメインが作られる場合あり。なくてもログイン自体は可）

### 合格条件
- [ ] 新規登録・ログイン・ログアウト・再ログインができる
- [ ] 保護ページが未ログインで遮断される
- [ ] スマホでもログインできる
- [ ] 未実装のログイン方式を「使える」と誤認していない

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________

---

## 5. Word・PDF・Excel の本番生成確認

### 開く画面
- ログイン後: **新しい依頼**（例 `/workspace` またはホームの依頼導線）

### 押すボタン
1. 依頼を作成して実行完了まで待つ
2. 成果物エリアで **Word / PDF / Excel** をそれぞれダウンロード

### 入力する内容（例・順番に3回）
1. Word向け: 「短い営業提案書を Word で作成してください。表を1つ含めて。」
2. PDF向け: 「日本語の報告書を PDF で作成してください。見出しと表あり、複数ページ。」
3. Excel向け: 「金額・日付・割合の一覧表を Excel で作成。10行以上。危険な数式開始文字（例: `=1+1`）もセルに含めて。」

### 正常時の表示
- 完了状態と成果物ボタン（Word / PDF / Excel）
- ダウンロードしたファイルが開ける
- 0KB ではない
- 日本語ファイル名が極端に壊れない

### 失敗時に確認する場所
- 画面のエラー文言
- `/api/deliverables/generate` の応答（Network タブ）
- OpenAI キー・課金プラン制限

### Vercel Logs で探すログ
- `[Atlas /api/deliverables/generate]`
- フォント / PDF / exceljs 関連エラー

### Supabase で確認するテーブル
- 成果物本体はプロセスメモリの場合あり。永続は Drive 連携時など別経路。  
  まずは **ファイルが開けること** を合格条件にする。

### 合格条件
- [ ] Word・PDF・Excel を本番で各1回以上生成し、実ファイルとして開ける
- [ ] 失敗時に成功表示していない

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________

---

## 6. 成果物ダウンロードと所有権確認

### 開く画面
- ユーザーA: 成果物がある結果画面
- ユーザーB: 別ブラウザ（またはシークレット）でログイン
- Network タブ: `/api/deliverables/<id>`

### 押すボタン
1. ユーザーAで成果物をダウンロード（成功すること）
2. ダウンロード URL（`/api/deliverables/<id>`）をコピー
3. ユーザーBで同じ URL を開く / fetch する
4. 未ログインでも同 URL を開く

### 入力する内容
- なし（URL の再利用のみ）

### 正常時の表示
- ユーザーA: 200 でファイル取得
- ユーザーB / 未ログイン: **401 または 404**（中身は取れない）

### 失敗時に確認する場所
- Network の status / JSON `error`
- デプロイが PR #15 以降か（所有権必須化前だと危険）

### Vercel Logs で探すログ
- deliverables 404/401（他ユーザー拒否）

### Supabase で確認するテーブル
- なし（メモリストア時）。所有権は API 応答で判定。

### 合格条件
- [ ] 所有者のみダウンロード可能
- [ ] 他ユーザー・未ログインではファイル本文を取得できない
- [ ] Android Chrome でもダウンロードできる（可能なら）

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________

---

## 7. Android Push 通知確認

### 開く画面
- Android Chrome で本番サイト
- `/settings/notifications`（お知らせ設定）

### 押すボタン
1. **スマホ通知を有効にする**（文言は UI の有効化ボタン）
2. ブラウザの通知許可で「許可」
3. **テスト通知を送信**
4. 端末の通知シェードに届くか確認
5. 端末一覧に自分の端末が出るか確認

### 入力する内容
- なし（許可ダイアログのみ）

### 正常時の表示
- 「スマホ通知を有効にしました」
- 「テスト通知を送信しました」（同等文言）
- Android 実機に通知が表示される

### 失敗時に確認する場所
- VAPID 3変数が Production にあるか
- HTTPS か（必須）
- Chrome のサイト通知設定がブロックされていないか
- iOS はこの手順の合格条件に使わない（別制約あり）

### Vercel Logs で探すログ
- `[push notify]`
- web-push / VAPID 関連エラー
- `/api/push/test` `/api/push/subscribe`

### Supabase で確認するテーブル
- `atlas_push_subscriptions`  
  - `user_id` が自分  
  - `endpoint` がある  
  - 無効化後は inactive / 削除されること

### 合格条件
- [ ] Android 実機で購読成功
- [ ] テスト Push が実機に届く
- [ ] Supabase に自分の購読行がある
- [ ] **実機未確認のまま合格にしない**

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________

---

## 8. 通知タップ・既読同期確認

### 開く画面
- アプリ内通知パネル / `/notifications`（実装されている画面）
- Android の Push 通知

### 押すボタン
1. テスト通知または仕事完了通知を発生させる
2. 通知をタップして遷移先を確認
3. 該当通知が既読になることを確認
4. 別端末/再読込後も未読件数が減っていることを確認
5. 通知 OFF にすると新規が来ない（または来ても Push されない）ことを確認

### 入力する内容
- なし

### 正常時の表示
- タップ先が正しい仕事/結果
- 既読後に未読バッジが減る
- 再読み込みしても既読が戻らない

### 失敗時に確認する場所
- `/api/notifications/.../read`
- `/api/push/click`
- 通知設定の channels.push / allEnabled

### Vercel Logs で探すログ
- push click / notifications persist 失敗

### Supabase で確認するテーブル
- `atlas_user_state`（notifications ドメイン）
- `atlas_push_subscriptions`（無効購読の扱い）

### 合格条件
- [ ] タップ遷移が正しい
- [ ] 既読がサーバー側に残り、再読込後も同期する
- [ ] 他ユーザーの通知を既読にできない（可能なら ID 直打ちで確認）

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________

---

## 9. X 再連携

### 開く画面
- `/settings/x` またはワークスペースの X 連携パネル
- X Developer Portal（権限確認用）

### 押すボタン
1. 未接続なら **Xを接続**
2. 接続済みなら一度切断→ **再接続 / 再連携**
3. Write 権限（`tweet.write`）付きで承認

### 入力する内容
- X の認可画面で本番アカウントを選択

### 正常時の表示
- 接続済み / ユーザー名表示
- 「再連携が必要」警告が出ていない

### 失敗時に確認する場所
- `X_CLIENT_ID` / `X_CLIENT_SECRET` / `X_REDIRECT_URI`
- X Portal の Callback URL が本番と一致するか
- App permissions が Read and write か

### Vercel Logs で探すログ
- X OAuth callback エラー
- refresh / scope 不足

### Supabase で確認するテーブル
- `atlas_x_oauth_credentials`  
  - 自分の `user_id`  
  - token がある（値は開いてコピーしない）  
  - status が接続済み相当

### 合格条件
- [ ] 本番 X アカウントで再連携成功
- [ ] Write 権限あり
- [ ] 認証切れ表示がない

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________

---

## 10. X 手動実投稿

> 実際に X へ投稿されます。テスト用アカウント推奨。

### 開く画面
- `/workspace/x` または X 投稿パネル  
  もしくは自動化作成画面の **今すぐテスト投稿**

### 押すボタン
1. モードで **テスト投稿** を選ぶ（または「今すぐテスト投稿」）
2. 送信ボタンを押す
3. **連打しない**（1回だけ。二重投稿確認は意図的に2回目を時間を空けて）

### 入力する内容
- 任意の短い本文（空でもテスト投稿は短い確認文が付く場合あり）
- 例: `MINERVOT接続確認 <日付>`

### 正常時の表示
- 「テスト投稿に成功しました」等
- 画面上に投稿 ID / URL が出る（出る実装の場合）
- 実際の X 上に投稿が存在する

### 失敗時に確認する場所
- 画面エラー（権限 / 再連携 / rate limit）
- X 連携状態
- プラン制限（SNS 機能）

### Vercel Logs で探すログ
- **成功時のみ**: `[X Post] tweet created`（`tweetId` / `tweetUrl` あり）
- draft/preview だけのときは `[X Post] preview generated`（これは実投稿成功ではない）
- `tweet created` が出ていないのに成功表示なら不合格

### Supabase で確認するテーブル
- `atlas_x_oauth_credentials`（last used 等）
- 履歴が user_state / 実行ログにある場合はそちらも

### 合格条件
- [ ] 実アカウントで投稿が X 上に存在する
- [ ] ログが `[X Post] tweet created`
- [ ] 投稿失敗時に成功表示していない
- [ ] **実投稿していない場合は合格にしない**

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________  
**投稿URL（任意・公開情報のみ）:** ________________

---

## 11. 投稿ID・URL・日時保存確認

### 開く画面
- X 投稿履歴 UI / 自動化実行ログ（Owner: `/owner/automation-execution-logs`）
- 直前のテスト投稿結果画面

### 押すボタン
1. 直前の成功投稿の詳細を開く
2. 必要なら Owner の実行ログを更新

### 入力する内容
- なし

### 正常時の表示
- 投稿 ID がある
- 投稿 URL がある（または ID から辿れる）
- 投稿日時が保存されている
- 対象アカウントが正しい

### 失敗時に確認する場所
- 履歴に ID がなく completed になっていないか
- Runtime Logs の `tweetId`

### Vercel Logs で探すログ
- `[X Post] tweet created` の `tweetId` / `tweetUrl`

### Supabase で確認するテーブル
- 実行・履歴の保存先（user_state / jobs / 実行ログ）
- Owner 実行ログに `xPostId` / `xPostUrl` があること

### 合格条件
- [ ] 投稿 ID・URL・日時が保存されている
- [ ] 投稿 ID なしで completed 扱いになっていない

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________

---

## 12. Stripe Test Mode Checkout

> **Live Mode で課金しない。** Vercel の Stripe キーが `sk_test_` / `pk_test_` であることを確認してから実施。

### 開く画面
- `/pricing` または `/settings/billing`
- Stripe Dashboard（Test Mode ON）

### 押すボタン
1. 有料プラン（Light / Standard / Premium のいずれか）で Checkout 開始
2. Stripe 画面でテストカード決済
3. 成功 URL（`/billing/success` 相当）へ戻ることを確認
4. キャンセル導線も一度確認（決済せず戻る）

### 入力する内容
- テストカード: Stripe 公式の `4242 4242 4242 4242`
- 有効期限: 任意の将来月
- CVC: 任意

### 正常時の表示
- Checkout セッションが開く
- 成功後にプラン反映の案内 / サマリー更新
- 秘密鍵がブラウザに出ていない（Network で `sk_` がレスポンスに無い）

### 失敗時に確認する場所
- `STRIPE_PRICE_*` が Test Mode の Price ID か
- Production guard（test/live 不一致）
- `/api/billing/checkout` のエラー JSON

### Vercel Logs で探すログ
- checkout session created / price mismatch / production guard

### Supabase で確認するテーブル
- `atlas_billing_subscriptions`（次項で本確認）

### 合格条件
- [ ] Test Mode で Checkout 成功まで完了
- [ ] 成功URL・キャンセルURLが想定どおり
- [ ] Live 課金をしていない

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________

---

## 13. Stripe Webhook 反映確認

### 開く画面
- Stripe Dashboard → Developers → Webhooks（Test Mode）
- エンドポイント: `https://<本番>/api/billing/webhook`（互換 `/api/stripe/webhook`）
- `/settings/billing`

### 押すボタン
1. Checkout 完了イベントが Webhook で delivered か確認
2. 同じ event を再送（Replay）して二重でプランが増えないことを確認
3. アプリの請求サマリーが更新されているか確認

### 入力する内容
- なし（Stripe の Replay 操作）

### 正常時の表示
- Webhook が 2xx
- アプリ上のプランが Test 契約内容と一致
- Replay しても二重契約にならない

### 失敗時に確認する場所
- `STRIPE_WEBHOOK_SECRET`
- Stripe の応答 body / status
- 署名検証失敗（400）

### Vercel Logs で探すログ
- webhook signature / idempotency / checkout.session.completed

### Supabase で確認するテーブル
- `atlas_billing_subscriptions`（user と plan / status）
- `atlas_stripe_webhook_events`（event id が1回だけ処理）

### 合格条件
- [ ] Webhook 署名検証成功
- [ ] プラン状態が保存される
- [ ] 同一イベントの二重処理がない

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________

---

## 14. 自動化の作成・停止・再開

### 開く画面
- 自動化 / 任せる仕事ダッシュボード
- 作成フォーム
- Owner: `/owner/automation-execution-logs`（手動 tick 用）

### 押すボタン
1. 新規作成（毎日 / 平日 / 毎週 / 毎月のいずれか）
2. 保存
3. **一時停止**
4. **再開**
5. Owner で **予定実行を手動シミュレーション**（または `POST /api/automations/tick`）
6. X 向けなら **今すぐテスト投稿**（任意・実投稿注意）

### 入力する内容
- 名前: 例「毎朝の要約」
- 依頼文: 短い文章
- 時刻: 未来の時刻
- タイムゾーン: `Asia/Tokyo`
- 有効: ON で作成 → 後で停止

### 正常時の表示
- 作成後に次回実行日時がある
- 停止中は次回実行が「—」/ 非表示
- 再開後は **未来の次回**のみ（過去分の大量実行なし）
- 手動 tick で処理件数が出る

### 失敗時に確認する場所
- 自動化詳細のエラー
- X 未接続のまま destination=x にしていないか
- `ENABLE_SCHEDULED_CRON=false` になっていないか

### Vercel Logs で探すログ
- automation tick / job reliability
- X recurring 実行ログ

### Supabase で確認するテーブル
- `atlas_user_state`（automations ドメイン）
- `atlas_automation_jobs`

### 合格条件
- [ ] 作成・停止・再開ができる
- [ ] 停止中に新しい予定を作らない / 次回を出さない
- [ ] 再開後に過去分を大量実行しない
- [ ] 手動 tick で予定実行ロジックを確認できる

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________

---

## 15. ユーザーAとユーザーBのデータ分離

### 開く画面
- ブラウザA: ユーザーA
- ブラウザB（シークレット）: ユーザーB
- 確認対象: 仕事 / 自動化 / 成果物 URL / 通知 / Owner

### 押すボタン・操作
1. A で自動化・成果物・通知を用意
2. B で A の自動化 ID / 成果物 ID / 通知 ID を URL や API に直打ち
3. B で `/owner` を開く（一般ユーザーなら入れないこと）

### 入力する内容
- A のリソース ID（B の画面に出ない前提で、A の Network から確認）

### 正常時の表示
- B は A の一覧に A のデータが見えない
- 直打ちは 401/403/404
- 一般ユーザーは Owner に入れない

### 失敗時に確認する場所
- 該当 API の status
- Clerk の userId がレスポンスで入れ替わっていないか
- PR #15 以降のデプロイか

### Vercel Logs で探すログ
- Unauthorized / not found（他ユーザー拒否）

### Supabase で確認するテーブル
- 各テーブルの `user_id` が混在していないか（service role 閲覧時）
- RLS が deny-all のままか

### 合格条件
- [ ] A の仕事・自動化・成果物・通知を B が操作できない
- [ ] クライアント指定の user_id を信用していない（直打ち不可）
- [ ] 一般ユーザーが管理者画面に入れない

**結果:** □ 合格　□ 不合格　□ 未確認  
**確認日:** ____ / ____　**確認者:** ________

---

## 16. 最終的な Pro 課金可否判定

### 開く画面
- このチェックリスト全体
- `docs/development/pre-pro-billing-audit.md`（参考）

### 押すボタン
- なし（集計のみ）

### 入力する内容
- 下記サマリー表を埋める

### 判定基準

| 判定 | 条件 |
| --- | --- |
| **A: Pro へ変更してよい** | 1〜15 がすべて **合格**（未確認ゼロ） |
| **B: 条件を満たしたら Pro 可能** | 不合格ゼロだが、運用上の軽微な未確認のみ（本手順では使わない。未確認があるなら C） |
| **C: まだ Pro へ変更しない** | 1つでも **不合格** または **未確認** |

### 正常時の表示
- 1〜15 がすべて合格
- その場合のみ「A」と書いてよい

### 失敗時に確認する場所
- 未確認の項目番号
- 不合格の再現手順

### Vercel Logs / Supabase
- 該当項目のログ・テーブルを再確認

### 合格条件（Pro 推奨に進む条件）
- [ ] 項目1〜15がすべて合格
- [ ] X 実投稿済み
- [ ] Android Push 実機到達済み
- [ ] Stripe Test Mode Checkout + Webhook 済み
- [ ] Migration / 環境変数 確認済み

**いまの判定（記入）:** □ A　□ B　□ C  
**判定日:** ____ / ____　**判定者:** ________

> **重要:** 1つでも未確認/不合格がある間は **C** とし、Vercel Pro への変更を推奨しない。

---

## 総括チェック表（記入用）

| # | 項目 | 結果 | 確認日 | 確認者 | メモ |
| ---: | --- | --- | --- | --- | --- |
| 1 | PR #15 マージ確認 | □合格 □不合格 □未確認 |  |  |  |
| 2 | Supabase Migration | □合格 □不合格 □未確認 |  |  |  |
| 3 | Production 環境変数 | □合格 □不合格 □未確認 |  |  |  |
| 4 | Clerk 実機ログイン | □合格 □不合格 □未確認 |  |  |  |
| 5 | Word / PDF / Excel 生成 | □合格 □不合格 □未確認 |  |  |  |
| 6 | 成果物DL・所有権 | □合格 □不合格 □未確認 |  |  |  |
| 7 | Android Push | □合格 □不合格 □未確認 |  |  |  |
| 8 | 通知タップ・既読同期 | □合格 □不合格 □未確認 |  |  |  |
| 9 | X 再連携 | □合格 □不合格 □未確認 |  |  |  |
| 10 | X 手動実投稿 | □合格 □不合格 □未確認 |  |  |  |
| 11 | 投稿ID・URL・日時保存 | □合格 □不合格 □未確認 |  |  |  |
| 12 | Stripe Test Checkout | □合格 □不合格 □未確認 |  |  |  |
| 13 | Stripe Webhook | □合格 □不合格 □未確認 |  |  |  |
| 14 | 自動化 作成・停止・再開 | □合格 □不合格 □未確認 |  |  |  |
| 15 | ユーザーA/B 分離 | □合格 □不合格 □未確認 |  |  |  |
| 16 | Pro 課金可否判定 | □A □B □C |  |  | 未確認があれば必ず C |

### Pro 変更前の最終宣言（コピー用）

```
実機確認の結果:
- 合格: __ / 15
- 不合格: __
- 未確認: __

判定: C（すべて合格するまで Pro 変更は推奨しない）
 ※ 15項目すべて合格した場合のみ A に変更可
```

---

## 参考リンク（リポジトリ内）

- Hobby Cron: `docs/development/hobby-cron-deploy.md`
- 環境変数詳細: `docs/development/pre-pro-env-vars.md`
- Migration詳細: `docs/development/pre-pro-migrations.md`
- 監査メモ: `docs/development/pre-pro-billing-audit.md`
- Pro 用 Cron テンプレ: `vercel.cron.pro.json`
