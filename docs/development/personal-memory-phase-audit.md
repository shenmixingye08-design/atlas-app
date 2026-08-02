# Personal Memory Phase — 現状監査結果

監査日: 2026-08-02

## 分類サマリ

| 項目 | 旧状態 | 分類 |
|------|--------|------|
| 1. Memory保存先 | Work Memory=`atlasWorkMemory` / User Memory=processのみ | 部分実装→本Phaseで `atlasPersonalMemory` 追加 |
| 2. User Metadata | 重いドメインはClerk非使用 | 本番利用可能 |
| 3. Clerk Metadata | Work/Learningはクリア対象 | 本番利用可能 |
| 4. Supabase | `atlas_user_state` JSON | 本番利用可能 |
| 5. 会話履歴との差 | chatは非永続 | 会話履歴だけ（別物） |
| 6. 保存条件 | User Memoryが無制御学習 | 無制御保存→候補承認へ変更 |
| 7. 利用条件 | orchestrate未hydrate | 部分実装 |
| 8. 削除 | APIあり | 実装済みだが未検証 |
| 9. 更新 | APIあり | 実装済みだが未検証 |
| 10. 優先順位 | 曖昧 | 未実装→本Phaseで厳格化 |
| 11. 自動化接続 | policyのみ | 仮実装→bridge実装 |
| 12. 成果物接続 | プロンプト文字列のみ | 部分実装 |
| 13. 管理画面 | `/settings/memory` 旧UI | UIのみ〜部分実装 |
| 14. ユーザー設定 | 分散 | 部分実装 |
| 15. Audit | Memory CRUDなし | 未実装→追加 |
| 16. 個人情報 | Workはfilter、Userはなし | セキュリティ不足 |
| 17. テスト | unitあり | 実装済みだが未検証 |
| 18. 本番証拠 | Work/Learningは想定 | 実装済みだが未検証 |

## 根本問題

1. User Memoryが確認なしでactive化していた  
2. Memoryが自由文カテゴリ中心でScope分離が弱い  
3. Automation Runが実際のMemory値を解決していなかった  
4. 今回指示よりMemoryが優先される危険  
5. 外部文書由来のPoisoning境界が曖昧  

## 本Phaseの方針

Personal Memory（`lib/personal-memory`）を SoT とし、推測はcandidateのみ、承認後にactive。Automation Runへledger連携。
