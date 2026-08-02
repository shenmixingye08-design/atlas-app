# Memory / Prediction Production — 現行経路監査

監査時点: Phase「Memory / Prediction Production Integration」着手前〜統合後。

| 項目 | 着手前 | 統合後 |
|---|---|---|
| 修正Diff取得 | 部分実装（personal-memory correction / 文字中心） | 本番実動作（structural-diff: tone/verbosity/headings/…） |
| Candidate作成 | 本番実動作（閾値3回） | 本番実動作（evidence≥3 ∧ confidence≥0.8） |
| Confidence更新 | 部分実装 | 本番実動作 |
| 正式Memory昇格 | 部分実装（承認フローあり） | 本番実動作（高影響は承認必須） |
| Memory保存先 | 本番実動作（atlasPersonalMemory / atlasWorkMemory） | 本番実動作（+ atlasProductionMemory durable） |
| owner分離 | 本番実動作 | 本番実動作（優先解決でも強制） |
| company分離 | 未接続 / 部分 | 本番実動作（scopeType=company） |
| category分離 | 部分実装 | 本番実動作（workCategory） |
| artifact type分離 | 部分実装 | 本番実動作 |
| automation分離 | 部分実装 | 本番実動作 |
| template分離 | 未接続 | 本番実動作 |
| planner注入 | 部分実装（文字列） | 本番実動作（PersonalizationContext構造化 + hint） |
| generator注入 | 未接続 | 本番実動作（content + options） |
| exporter反映 | 未接続 | 本番実動作（docx/xlsx/pdf/pptx options） |
| quality evaluation | UIのみ / 固定値リスク | 本番実動作（measured ledger） |
| apply preview | 未接続 | 本番実動作（previewLines API/UI） |
| disable / delete / rollback / version / audit | 部分実装 | 本番実動作（production memory） |
| Prediction | ルールをAI予測と誤認リスク | deterministic_rule / heuristic / statistical / llm を区別。「過去の利用から提案」 |
| value-home 適用数 | localStorageのみ（価値指標に使わない） | 価値指標から排除。ledger実測のみ |

## 分類凡例

- 本番実動作 / 部分実装 / UIのみ / localStorageのみ / process memoryのみ / mock / 未接続 / 未検証 / 壊れている
