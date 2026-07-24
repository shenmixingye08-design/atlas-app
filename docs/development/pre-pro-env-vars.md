# Pre-production environment variable audit

目的: app/runtime code の `process.env` 参照（`ts` / `tsx` / `js` / `mjs`）と `.env.local.example` に記載された環境変数を、値を記載せずに整理する。  
このエージェント環境では実際の設定値は確認していないため、設定状況は原則 **未確認** とする。

## 判定ルール

- **Previewに必要か / Productionに必要か**: その機能を有効にする場合に必要かを含む。全機能必須ではないものは「機能利用時」と記載。
- **秘密情報か**: ブラウザ公開前提の `NEXT_PUBLIC_*` は「いいえ」。サーバーキー、Webhook secret、OAuth client secret、暗号鍵、サービスロールは「はい」。
- **取得元**: ダッシュボードやプラットフォームなど、値を取得・設定する場所のみ。値そのものは記載しない。
- **設定済みか未確認か**: この環境では原則「未確認」。`NODE_ENV` / `VERCEL_*` はプラットフォーム自動だが値は未確認。

## Env matrix

| 変数名 | 用途 | 必須か任意か | Previewに必要か | Productionに必要か | 秘密情報か | 取得元 | 設定状況 | 未設定時の挙動 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI Responses API 実行 | 必須 | AI実行時に必要 | 必須 | はい | OpenAI dashboard | 未確認 | AI実行時に例外。`ATLAS_MOCK_LLM=true` のローカル検証は別 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk クライアント認証 | 必須 | 認証Previewで必要 | 必須 | いいえ | Clerk dashboard | 未確認 | Production guard が 503/例外で fail closed |
| `CLERK_SECRET_KEY` | Clerk サーバーAPI、privateMetadata、OAuth state fallback | 必須 | 認証・永続化検証で必要 | 必須 | はい | Clerk dashboard | 未確認 | Production guard が fail closed。Clerk metadata 永続化はスキップ |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Clerk sign-in route | 必須（Clerk UX） | 認証Previewで必要 | 必須 | いいえ | Clerk / Vercel env | 未確認 | Clerk の既定・アプリルートと不一致になる可能性 |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Clerk sign-up route | 必須（Clerk UX） | 認証Previewで必要 | 必須 | いいえ | Clerk / Vercel env | 未確認 | Clerk の既定・アプリルートと不一致になる可能性 |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | ログイン後遷移先 | 必須（Clerk UX） | 認証Previewで必要 | 必須 | いいえ | Clerk / Vercel env | 未確認 | Clerk 既定遷移になる可能性 |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | 登録後遷移先 | 必須（Clerk UX） | 認証Previewで必要 | 必須 | いいえ | Clerk / Vercel env | 未確認 | Clerk 既定遷移になる可能性 |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL` | ログアウト後遷移先 | 必須（Clerk UX） | 認証Previewで必要 | 必須 | いいえ | Clerk / Vercel env | 未確認 | Clerk 既定遷移になる可能性 |
| `CLERK_WEBHOOK_SECRET` | Clerk Webhook 署名検証 | 必須（監査運用） | Webhook検証時 | 必須 | はい | Clerk Webhooks | 未確認 | Webhook 監査同期が安全に処理できない |
| `NEXT_PUBLIC_SITE_URL` | SEO / OGP / sitemap / Stripe戻り先候補 | 必須 | Preview URL確認で推奨 | 必須 | いいえ | Vercel project env | 未確認 | `NEXT_PUBLIC_APP_URL` / `VERCEL_URL` / 仮URLへ fallback |
| `NEXT_PUBLIC_APP_URL` | アプリ絶対URL、Push target、Stripe origin候補 | 必須 | Preview URL確認で必要 | 必須 | いいえ | Vercel project env | 未確認 | 一部URL生成は `NEXT_PUBLIC_SITE_URL` へ fallback。Push target が空/相対になる可能性 |
| `VERCEL_URL` | Vercel 自動ホスト名 fallback | 任意（自動） | Vercel Previewで自動 | Productionでは canonical host 優先 | いいえ | Vercel platform | 未確認 | SEO origin は仮URLへ fallback |
| `VERCEL_ENV` | Production判定 | 任意（自動） | Vercelで自動 | Vercelで自動 | いいえ | Vercel platform | 未確認 | `NODE_ENV` で Production 判定 |
| `NODE_ENV` | Production/dev 判定、dev preview gate | 任意（自動） | 自動 | 自動 | いいえ | Node/Next runtime | 未確認 | dev/prod guard・ログ出力判定が実行環境依存 |
| `ATLAS_OWNER_EMAILS` | Owner route/API 許可メール | 必須 | Owner Preview検証で必要 | 必須 | 個人情報（非公開） | 運営設定 | 未確認 | Production の Owner route が fail closed |
| `ATLAS_OPERATOR_BUSINESS_NAME` | 特商法・販売事業者名 | 必須（公開前） | 任意 | 必須 | いいえ（公開情報） | 運営設定 | 未確認 | fallback 表示。Production で警告 |
| `ATLAS_OPERATOR_REPRESENTATIVE_NAME` | 特商法・運営責任者名 | 必須（公開前） | 任意 | 必須 | いいえ（公開情報） | 運営設定 | 未確認 | placeholder fallback。Production で警告 |
| `ATLAS_OPERATOR_ADDRESS` | 特商法・公開所在地 | 必須（公開前） | 任意 | 必須 | いいえ（公開情報） | 運営設定 | 未確認 | placeholder fallback。Production で警告 |
| `ATLAS_OPERATOR_CONTACT_EMAIL` | 特商法・問い合わせ先 | 必須（公開前） | 任意 | 必須 | いいえ（公開情報） | 運営設定 | 未確認 | fallback email。Production で警告 |
| `CRON_SECRET` | `/api/automations/tick` 認証 | 必須 | 手動/Preview tick検証で必要 | 必須 | はい | Vercel env / 運営生成 | 未確認 | Production tick は 503/401。非Productionでも未ログイン時は 503 |
| `ENABLE_SCHEDULED_CRON` | due自動処理 kill-switch | 任意 | 誤実行抑制で任意 | 緊急停止で任意 | いいえ | Vercel env | 未確認 | 未設定は有効。`false` のとき認証後も `{ skipped: true }` |
| `OAUTH_STATE_SECRET` | OAuth CSRF state 署名 | 推奨 | OAuth Previewで推奨 | 推奨（実質必須） | はい | 運営生成 | 未確認 | `CLERK_SECRET_KEY` に fallback。Productionで両方無いと OAuth state 作成不可 |
| `STRIPE_SECRET_KEY` | Stripe サーバーAPI | 課金公開時必須 | Stripe test検証時必要 | 課金公開時必須（live） | はい | Stripe dashboard | 未確認 | Production checkout/webhook guard が fail closed。非Productionは mock fallback あり |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe 公開キー | 課金公開時必須 | Stripe test検証時必要 | 課金公開時必須（live） | いいえ | Stripe dashboard | 未確認 | Production checkout guard が fail closed |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook署名検証 | 課金公開時必須 | Webhook test時必要 | 課金公開時必須 | はい | Stripe Webhooks | 未確認 | Webhook route が 503 / 400 |
| `STRIPE_PRICE_LIGHT` | Light plan Price ID allowlist | 課金公開時必須 | Stripe test検証時必要 | 課金公開時必須 | いいえ（ID） | Stripe Products/Prices | 未確認 | Light checkout不可、price mismatch/未設定扱い |
| `STRIPE_PRICE_STANDARD` | Standard plan Price ID allowlist | 課金公開時必須 | Stripe test検証時必要 | 課金公開時必須 | いいえ（ID） | Stripe Products/Prices | 未確認 | Standard checkout不可、price mismatch/未設定扱い |
| `STRIPE_PRICE_PREMIUM` | Premium plan Price ID allowlist | 課金公開時必須 | Stripe test検証時必要 | 課金公開時必須 | いいえ（ID） | Stripe Products/Prices | 未確認 | Premium checkout不可、price mismatch/未設定扱い |
| `STRIPE_PRICE_FREE` | Free plan Price ID placeholder | 任意 / unused-looking | 不要 | 不要 | いいえ（ID） | Stripe Products/Prices | 未確認 | Free plan は checkout しないため通常影響なし |
| `SUPABASE_URL` | Server Supabase URL | 推奨〜必須（永続化機能） | 永続化Previewで必要 | 永続化・課金・連携で必要 | いいえ（URL） | Supabase project settings | 未確認 | `NEXT_PUBLIC_SUPABASE_URL` へ fallback。なければ Supabase無効 |
| `SUPABASE_ANON_KEY` | Server/browser anon key fallback | 推奨 | Supabase Previewで必要 | Supabase browser利用で必要 | いいえ（RLS前提） | Supabase API settings | 未確認 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` へ fallback。なければ browser client不可 |
| `SUPABASE_SERVICE_ROLE_KEY` | Server durable writes / RLS bypass | 強く推奨〜必須 | 永続化Previewで必要 | 課金・OAuth・Push・Jobsで必須 | はい | Supabase API settings | 未確認 | durable Supabase writes/read が null/skip。Production correctness不可 |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser Supabase URL / server fallback | 推奨 | Supabase Previewで必要 | Supabase browser利用で必要 | いいえ | Supabase project settings | 未確認 | `SUPABASE_URL` へ fallback。なければ browser client不可 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser Supabase anon key / server fallback | 推奨 | Supabase Previewで必要 | Supabase browser利用で必要 | いいえ（RLS前提） | Supabase API settings | 未確認 | `SUPABASE_ANON_KEY` へ fallback。なければ browser client不可 |
| `NEXT_PUBLIC_ATLAS_PROJECT_STORAGE` | Project storage backend selector | 任意 | storage検証時 | Productionは `supabase` 推奨 | いいえ | Vercel env | 未確認 | Supabase configured なら Supabase、なければ localStorage |
| `ATLAS_BETA_USER_EMAILS` | beta user allowlist | 任意 | beta検証時 | beta運用時 | 個人情報（非公開） | 運営設定 | 未確認 | env由来 beta users は空 |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | 機能利用時必須 | Google連携Previewで必要 | Google連携時必須 | いいえ | Google Cloud Console | 未確認 | Google連携開始時に例外 |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | 機能利用時必須 | Google連携Previewで必要 | Google連携時必須 | はい | Google Cloud Console | 未確認 | Google連携開始時に例外。dev OAuth state fallback候補 |
| `GOOGLE_REDIRECT_URI` | Google account OAuth redirect URI | Production必須 | Previewで推奨 | Google連携時必須 | いいえ | Google Cloud Console / Vercel env | 未確認 | Productionでは Host derivation禁止で例外。非Productionは request origin から生成 |
| `GOOGLE_ACCOUNT_REDIRECT_URI` | Google redirect URI alias | 任意（alias） | alias利用時 | alias利用時 | いいえ | Google Cloud Console / Vercel env | 未確認 | `GOOGLE_REDIRECT_URI` 未設定時の alias。両方なければ上記挙動 |
| `GOOGLE_DRIVE_REDIRECT_URI` | 旧/別系統 Google Drive OAuth redirect URI | 任意 / unused-looking | Drive旧ルート検証時 | 旧Drive機能利用時 | いいえ | Google Cloud Console / Vercel env | 未確認 | request origin から旧 callback path を生成 |
| `X_CLIENT_ID` | X OAuth client ID | X連携時必須 | X Previewで必要 | X連携時必須 | いいえ | X Developer Portal | 未確認 | X連携開始・live verify refresh不可 |
| `X_CLIENT_SECRET` | X OAuth client secret | X連携時必須 | X Previewで必要 | X連携時必須 | はい | X Developer Portal | 未確認 | X連携開始・token refresh不可。dev OAuth state fallback候補 |
| `X_REDIRECT_URI` | X OAuth callback URI | X連携時推奨 | Previewで推奨 | X連携時必要 | いいえ | X Developer Portal / Vercel env | 未確認 | request origin から callback path を生成 |
| `X_OAUTH_REDIRECT_URI` | X redirect URI alias | 任意（alias） | alias利用時 | alias利用時 | いいえ | X Developer Portal / Vercel env | 未確認 | `X_REDIRECT_URI` 未設定時の alias |
| `X_AUTOPOST_CATCHUP_MINUTES` | X auto-post catch-up window | 任意 | scheduler検証で任意 | 運用調整で任意 | いいえ | Vercel env | 未確認 | default catch-up window を使用 |
| `X_TEST_ACCESS_TOKEN` | `scripts/verify-x-post.mjs` live投稿検証用 | script-only必須 | live検証時のみ | 不要（runtime不要） | はい | X OAuth user token | 未確認 | script が BLOCKED で終了 |
| `ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY` | WordPress Application Password 暗号化鍵 | WordPress連携時必須 | WP Previewで必要 | WP連携時必須 | はい | 運営生成 | 未確認 | Productionで例外。非Productionは dev-only deterministic key |
| `DROPBOX_APP_KEY` | Dropbox OAuth app key | Dropbox連携時必須 | Dropbox Previewで必要 | Dropbox連携時必須 | いいえ | Dropbox App Console | 未確認 | Dropbox連携開始時に例外 |
| `DROPBOX_APP_SECRET` | Dropbox OAuth app secret | Dropbox連携時必須 | Dropbox Previewで必要 | Dropbox連携時必須 | はい | Dropbox App Console | 未確認 | Dropbox連携開始時に例外。dev OAuth state fallback候補 |
| `DROPBOX_REDIRECT_URI` | Dropbox OAuth redirect URI | Dropbox連携時推奨 | Previewで推奨 | Dropbox連携時必要 | いいえ | Dropbox App Console / Vercel env | 未確認 | request origin から callback path を生成 |
| `DROPBOX_CLIENT_ID` | Dropbox app key alias | 任意 / alias | alias利用時 | alias利用時 | いいえ | Dropbox App Console | 未確認 | `DROPBOX_APP_KEY` 未設定時のみ利用 |
| `DROPBOX_CLIENT_SECRET` | Dropbox app secret alias | 任意 / alias | alias利用時 | alias利用時 | はい | Dropbox App Console | 未確認 | `DROPBOX_APP_SECRET` 未設定時のみ利用 |
| `DROPBOX_OAUTH_REDIRECT_URI` | Dropbox redirect URI alias | 任意 / alias | alias利用時 | alias利用時 | いいえ | Dropbox App Console / Vercel env | 未確認 | `DROPBOX_REDIRECT_URI` 未設定時のみ利用 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API push/reply | LINE利用時必須 | LINE Previewで必要 | LINE利用時必須 | はい | LINE Developers | 未確認 | LINE送信は例外または configured=false |
| `LINE_CHANNEL_SECRET` | LINE Webhook署名検証 | LINE利用時必須 | LINE Previewで必要 | LINE利用時必須 | はい | LINE Developers | 未確認 | LINE Webhook検証不可 |
| `LINE_BOT_BASIC_ID` | LINE友だち追加案内 | 任意 | 任意 | 任意 | いいえ | LINE Developers | 未確認 | UI案内などで null |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | LINE access token alias | 任意 / alias | alias利用時 | alias利用時 | はい | LINE Developers | 未確認 | `LINE_CHANNEL_ACCESS_TOKEN` 未設定時のみ利用 |
| `LINE_MESSAGING_CHANNEL_SECRET` | LINE channel secret alias | 任意 / alias | alias利用時 | alias利用時 | はい | LINE Developers | 未確認 | `LINE_CHANNEL_SECRET` 未設定時のみ利用 |
| `ATLAS_OWNER_LINE_USER_ID` | 重大障害 Owner LINE 通知先 | 任意 | Owner通知検証時 | 運用時推奨 | 個人情報（非公開） | LINE / 運営設定 | 未確認 | Owner LINE incident push をスキップ |
| `VAPID_PUBLIC_KEY` | Web Push public key | Push利用時必須 | Push Previewで必要 | Push利用時必須 | いいえ | `web-push` key generation | 未確認 | Web Push configured=false。public key は null |
| `VAPID_PRIVATE_KEY` | Web Push private key | Push利用時必須 | Push Previewで必要 | Push利用時必須 | はい | `web-push` key generation | 未確認 | Push送信不可 |
| `VAPID_SUBJECT` | Web Push VAPID subject | Push利用時必須 | Push Previewで必要 | Push利用時必須 | いいえ（連絡先） | 運営設定 | 未確認 | Push送信不可 |
| `ATLAS_MOCK_LLM` | 非Production mock LLM | ローカル任意 | 通常不要 | 不要 | いいえ | local env | 未確認 | 実OpenAIを使用。Productionでは無効 |
| `ATLAS_DEBUG` | server/client debug inspector gate | ローカル任意 | Previewでは慎重 | Production不要 | いいえ（ただし情報露出注意） | local/Vercel env | 未確認 | debug payload/logなし |
| `NEXT_PUBLIC_ATLAS_DEBUG` | client debug gate / Next env exposure | ローカル任意 | Previewでは慎重 | Production不要 | いいえ（公開） | local/Vercel env | 未確認 | debug UIなし。`next.config.ts` default false |
| `ATLAS_DEBUG_VERBOSE` | verbose content logging | ローカル任意 | 通常不要 | 不要 | いいえ（ただし内容露出注意） | local env | 未確認 | verbose loggingなし |
| `NEXT_PUBLIC_ATLAS_DEBUG_VERBOSE` | client verbose debug alias | ローカル任意 / unused-looking | 通常不要 | 不要 | いいえ（公開） | local env | 未確認 | verbose debugなし |
| `ATLAS_CORE_TEST` | core deterministic test mode | ローカル/test任意 | 通常不要 | 不要 | いいえ | local/test env | 未確認 | normal orchestration path を使用 |
| `ATLAS_SEED_AUTOMATIONS` | dev seed automations toggle | ローカル任意 | 通常不要 | 不要 | いいえ | local env | 未確認 | 非Productionは seed 有効。`0` で無効 |
| `ATLAS_USD_JPY_RATE` | Owner分析の USD→JPY 換算 | 任意 | Owner Previewで任意 | Owner分析で推奨 | いいえ | 運営設定 | 未確認 | 円換算・利益率表示が 0/null |
| `ATLAS_API_BUDGET_OPENAI_USD` | Owner API usage budget | 任意 | Owner Previewで任意 | Owner運用で任意 | いいえ | 運営設定 | 未確認 | default budget を使用 |
| `ATLAS_API_BUDGET_GOOGLE_USD` | Owner API usage budget | 任意 | Owner Previewで任意 | Owner運用で任意 | いいえ | 運営設定 | 未確認 | default budget を使用 |
| `ATLAS_API_BUDGET_STRIPE_USD` | Owner API usage budget | 任意 | Owner Previewで任意 | Owner運用で任意 | いいえ | 運営設定 | 未確認 | default budget を使用 |
| `ATLAS_API_BUDGET_X_USD` | Owner API usage budget | 任意 | Owner Previewで任意 | Owner運用で任意 | いいえ | 運営設定 | 未確認 | default budget を使用 |
| `ATLAS_API_BUDGET_WORDPRESS_USD` | Owner API usage budget | 任意 | Owner Previewで任意 | Owner運用で任意 | いいえ | 運営設定 | 未確認 | default budget を使用 |
| `ATLAS_ANON_SALT` | anonymous user analysis hash salt | 任意（設定推奨） | Owner分析Previewで任意 | privacy強化で推奨 | はい（推奨非公開） | 運営生成 | 未確認 | code fallback salt で匿名ID生成 |
| `VERIFY_BASE_URL` | `scripts/verify-ui-gate.mjs` target base URL | script-only任意 | UI script時 | 不要 | いいえ | local/script env | 未確認 | localhost default を使用 |
| `BASE_URL` | `scripts/verify-notifications.mjs` target base URL | script-only任意 | UI script時 | 不要 | いいえ | local/script env | 未確認 | localhost default を使用 |
| `ATLAS_TRACE_URL` | `scripts/trace-workflow.ts` target base URL | script-only任意 | trace script時 | 不要 | いいえ | local/script env | 未確認 | localhost default を使用 |

## Obsolete / unused-looking / alias vars

| 変数名 | 理由 | 推奨扱い |
| --- | --- | --- |
| `STRIPE_PRICE_FREE` | code は Free plan に Price ID を保持できるが checkout は Free を拒否する。`.env.local.example` にも未記載 | Production課金に不要。残すなら将来用途を明記 |
| `DROPBOX_CLIENT_ID` / `DROPBOX_CLIENT_SECRET` / `DROPBOX_OAUTH_REDIRECT_URI` | Dropbox canonical 名は `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` / `DROPBOX_REDIRECT_URI`。code only alias | 互換 alias として扱い、運用envでは canonical 名へ統一 |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` / `LINE_MESSAGING_CHANNEL_SECRET` | LINE canonical 名は `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET`。code only alias | 互換 alias として扱い、運用envでは canonical 名へ統一 |
| `GOOGLE_DRIVE_REDIRECT_URI` | current `.env.local.example` は Google account OAuth の `GOOGLE_REDIRECT_URI` を案内。Drive専用旧/別callbackでのみ使用 | 使うルートが残るなら example へ追記、使わないなら整理候補 |
| `NEXT_PUBLIC_ATLAS_DEBUG_VERBOSE` | code 参照あり、`.env.local.example` 未記載。debug verbose を public に出す用途は限定的 | local-only として扱い、Productionでは未設定推奨 |
| `ATLAS_SEED_AUTOMATIONS` | dev seed 用で `.env.local.example` 未記載 | local-only。Production不要 |
| `X_TEST_ACCESS_TOKEN` | app runtime ではなく live verify script 専用 | script実行時だけ一時設定。永続envには置かない |
| `VERIFY_BASE_URL` / `BASE_URL` / `ATLAS_TRACE_URL` | verification script 専用 | local/script-only。Production不要 |
