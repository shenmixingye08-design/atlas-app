# 【ATLAS機能評価】Scheduler・Worker・Queue Productionization

機能名：Scheduler・Worker・永続Queue本番化  
ユーザー価値：毎週月曜9時など、設定した時刻に仕事が失われず・重複せず完了する  
差別化：チャットではなく「約束した時刻に仕事が終わる」信頼性  
繰り返し作業の削減：はい  
AI必要度：不要（スケジューリング・キューは通常プログラム）  
AIなしで実装可能：はい  
運営コスト：中（Postgres行・Cron/Actions分）  
外部APIコスト：なし（Queue自体）  
コスト削減案：  
- エコモード：対象外（インフラ）  
- まとめて生成：Schedulerはenqueueのみ、重い生成はWorker Step分割  
- キャッシュ再利用：occurrenceKeyで再enqueue禁止  
- 予約実行：Scheduler本体  
- AI起動条件：Workerが成果物Stepに到達した時のみ  
- 外部API最小化：tickはDBのみ  
- 承認後実行：waiting_approval状態で対応  
- 同じ処理を再生成しない：成功Stepのartifact保持  

優先度：P0

## Queue選定

| 候補 | 判定 | 理由 |
|---|---|---|
| PostgreSQL / Supabase job table + SKIP LOCKED | **採用** | 既存Supabase、追加費用なし、durable、lease/idempotencyをSQLで保証、1000人規模可 |
| pg-boss | 不採用 | 長時間プロセス前提。Vercel Hobbyと相性悪い。新依存 |
| Inngest / Trigger.dev / QStash | 不採用 | 有料/新規契約が必要（無断導入禁止） |
| Bull/Redis | 不採用 | Redis未導入、運用・費用増 |
| process memory | 禁止 | 再起動で消失 |

## 分単位発火

Vercel Hobbyは分Cron不可のため、**GitHub Actions `*/1 * * * *`** で `/api/automations/tick` を叩く本番経路を追加。`vercel.json` も Pro移行時に分単位へ更新可能な形にする。
