# External Integrations Production — Report

Branch: `cursor/integrations-production-83f5`  
Base: `main` @ `6bfc26e`

## 【ATLAS機能評価】

```
機能名：External Integrations Production（Live Adapter）
ユーザー価値：外部サービスへの保存・投稿・送信が最後まで完了し、途中成功に騙されない
差別化：Connection→Permission→Execution→Verification→Evidence→Notification の Fail Closed
繰り返し作業の削減：はい
AI必要度：不要
AIなしで実装可能：はい
運営コスト：中
外部APIコスト：有（実行時のみ）
優先度：P0
```

## Phase判定: **CONDITIONAL FAIL**

| 条件 | 状態 |
|---|---|
| Live Adapter 配線（Gmail/Calendar/Dropbox/WP/X/Drive） | **実装済み** |
| Fail Closed（token切れ・失敗→completed禁止） | **実装済み** |
| Evidence（externalActionId/URL/latency/retry） | **実装済み** |
| Retry（429/5xx/timeout/networkのみ） | **実装済み** |
| Duplicate idempotency | **実装済み**（process memory — multi-instanceは残課題） |
| Dashboard `/owner/live-adapters` | **実装済み** |
| CI / TS / Lint / Vitest | **PASS（ローカル）** |
| 本番OAuthでの実送信・実アップロード証拠 | **未実証** |
| Slack / Discord / Notion / Webhook / LINE work finish | **未実装** |

**APIがあるだけでは PASS にしない。** ライブ資格情報での end-to-end 実測が無いため Production PASS 宣言は禁止。

---

## 1. 接続一覧

| Provider | Connection | V2 Live Adapter | 分類 |
|---|---|---|---|
| Google Drive | OAuth (Google account) | Registry `google_drive`（V2 step未登録） | production_live / 部分（V2 step） |
| Gmail | OAuth | Wired `gmail` | production_live |
| Google Calendar | OAuth | Wired | production_live |
| Dropbox | OAuth | Wired | production_live |
| WordPress | App Password | Wired | production_live |
| X | OAuth PKCE | Wired | production_live |
| LINE | Channel token | 通知のみ | partial |
| Slack | — | 未接続 | unsupported |
| Discord | — | 未接続 | unsupported |
| Notion | stub禁止 | 未接続 | stub→error |
| Webhook outbound | — | 未接続 | unsupported |

## 2. OAuth

- Google / Dropbox / X: authorize → exchange → refresh → needs_reconnect
- WordPress: verify user before persist
- Notion/YouTube: connect success **禁止**（error）

## 3. Execution

Live Adapter Registry (`lib/live-adapters`) via `strictStepInvoker` → `invokeLiveAdapterForStep`.

| Provider | Action | ProviderID |
|---|---|---|
| Drive | Upload | fileId + webViewLink |
| Gmail | Draft/Send | messageId/draftId |
| Calendar | Create event | eventId + htmlLink |
| Dropbox | Upload | path/id + shared URL |
| WordPress | Draft/Publish | postId + link |
| X | Tweet | tweetId + URL |

## 4. Evidence

`buildIntegrationEvidence`: executionId, providerId, externalActionId, URL, timestamps, latencyMs, retryAttempts, checksum(optional), diagnosticId.  
`evidenceAllowsCompleted` — fake/stub id 禁止。

## 5. Monitoring

`buildAdapterHealth` — successRate, avg/p95 latency, retryRate, 429 rate, authFailureCount.  
Owner UI: `/owner/live-adapters` + health API.

## 6. Retry

`lib/integration-platform/retry-policy.ts` — 429/5xx/timeout/network only. 4xx never.

## 7. Duplicate

`idempotency.ts` — runId+stepId+provider(+content/destination).  
Vitest/test registryで二重実行スキップを検証。

## 8. Dashboard

`/owner/live-adapters` — 接続/分類/成功率/レイテンシ。

## 9. テスト

- `lib/live-adapters/*` + matrix（正常/429/500/timeout/OAuth/permission/duplicate）
- `lib/integration-platform/*`
- e2e-reliability PASS
- Notion stub success 禁止テスト

## 10–14. Build gates

| Gate | 結果 |
|---|---|
| TypeScript | 0 |
| Lint | 0 |
| Vitest (live-adapters / platform / e2e) | PASS |
| integrations-production-ban | PASS |
| v2-stub-ban | PASS（Live Adapter経路に更新） |
| Build | PR CI |

## 15. 残課題

1. 本番/Preview での実OAuth soak（実Gmail送信・実Drive upload等）
2. Idempotency の Postgres永続化（現状 process memory）
3. Drive の V2 capability step 追加（新機能扱い → 今回対象外）
4. Slack/Discord/Notion/Webhook 実装
5. Post-verify GET-after-write を全Providerで必須化（一部は構造検証のみ）

## 16. PASS/FAIL

**CONDITIONAL FAIL**

仕事が最後まで終わった証拠:
- Test Registry / 構造証明: **あり**
- 本番Provider実測: **未実証（未実装扱い）**
