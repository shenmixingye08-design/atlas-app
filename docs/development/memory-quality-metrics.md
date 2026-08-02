# Memory Quality Metrics

## 【ATLAS機能評価】

機能名：Memory品質計測（Memory Quality Metrics）  
ユーザー価値：使えば使うほど修正が減ることを数値で見える化する  
差別化：「Memoryがある」ではなく一致率・修正率・学習速度で品質向上を証明する  
繰り返し作業の削減：はい  
AI必要度：不要  
AIなしで実装可能：はい  
運営コスト：ローカル計算のみ  
外部APIコスト：無  
コスト削減案：エコ不要 / まとめて集計 / 直近N件キャッシュ / AI起動なし / 不足時のみ改善提案 / 再計算しない  
優先度：P0

## Memory Score

```
score = 55% × overallMatchRate
      + 35% × (1 - diffRate)
      + 10% × applyCoverage
```

| Score | Band | Label |
|------:|------|-------|
| 95+ | near_perfect | ほぼ完全一致 |
| 80+ | minor_edits | 少し修正あり |
| 60+ | room_to_improve | 改善余地あり |
| 40+ | memory_insufficient | Memory不足 |
| <40 | almost_first_run | ほぼ初回 |

## 測定項目

- Memory適用率（全体 / カテゴリ / Automation / 会社 / 成果物）
- 成果物一致率（文体・構成・長さ・レイアウト・保存先・形式・テンプレート）
- 修正率（削除・追加・置換文字数、Diff率）
- 学習速度（カテゴリ別 runIndex → Score / Diff）
- 改善提案（Score < 60 または Memory不足帯のみ）

## 証明条件

ダッシュボードの `proof` は同一カテゴリで2点以上あるときだけ算出する。

- `averageScoreLift > 0`
- `averageDiffRateDrop > 0`

これがない限り「品質が上がった」とは報告しない。
