# 【ATLAS機能評価】N-05 Memory適用のProduction実証

機能名：Personal Memory の Production 実証（保存→取得→成果物/Automation適用）

ユーザー価値：一度伝えた好みを次回以降の別依頼でも自動反映し、同じ指示の繰り返しをなくす

差別化：チャット履歴ではなく DB SoT の Preference が成果物・Automation に機械適用される

繰り返し作業の削減：はい — 「短めにして」「箇条書きで」「結論を先に」等の毎回指示が不要になる

AI必要度：低 — Preference の保存・取得・構造適用は通常プログラム。文章生成自体は既存経路

AIなしで実装可能：はい — 保存/取得/適用/分離/観測は AI 不要。生成本体は既存オーケストレーション

運営コスト：追加 AI 呼び出しなし（適用は overlay / metadata 注入）

外部APIコスト：無（既存 Supabase `atlas_user_state`）

コスト削減案：
- [x] エコモード：非該当（AI増なし）
- [x] まとめて生成：非該当
- [x] キャッシュ再利用：in-process は cache、正本は DB（再生成禁止ではないが再指示禁止）
- [x] 予約実行：非該当
- [x] AI起動条件：Memory 適用に AI を使わない
- [x] 外部API最小化：Supabase user_state のみ
- [x] 承認後実行：推論候補は既存どおり承認。明示 Preference は即 active
- [x] 同じ処理を再生成しない設計：Preference 再利用で毎回同指示を不要に

優先度：Critical（新品質評価 N-05）
