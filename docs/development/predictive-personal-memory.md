# Predictive Personal Memory

## 【ATLAS機能評価】

機能名：Predictive Personal Memory（先回り適用）  
ユーザー価値：指示なしでいつもの好みを適用し「このまま作成」だけで済む  
差別化：Prediction Score・説明・60%未満は確認・学習ループ  
繰り返し作業の削減：はい  
AI必要度：不要（ルールベース）  
外部APIコスト：無  
優先度：P0

## 優先順位

1. 今回の明示指示  
2. Automation専用 Memory  
3. 成果物カテゴリ Memory  
4. 会社 Memory  
5. 全体 Memory  
6. AI推論（低スコア → 確認）

## Prediction Score

Confidence とは別。層ウェイト + Confidence + 証拠頻度 − 拒否ペナルティ。

| Score | 帯 | 自動適用 |
|------:|----|:--------:|
| 97+ | 非常に高い | ✓ |
| 90+ | 高い | ✓ |
| 75+ | 候補 | ✓ |
| 60+ | 確認推奨 | ✓（境界） |
| &lt;60 | 適用しない | ✗ 確認必須 |

## 学習ループ

依頼 → Prediction → 生成 → 修正 → Diff → Memory更新 → Prediction改善 → 次回

## 禁止

- 60%未満の勝手適用
- 理由なし適用
- 同じ提案の連打
- 拒否済みの再押し
