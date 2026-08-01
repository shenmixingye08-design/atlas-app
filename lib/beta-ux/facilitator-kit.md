# βテスト実施キット（ファシリテーター用）

## テスターへの説明（これ以外は説明しない）

> MINERVOTを使って、指定された仕事を完了してください。

## 必須フロー（A–E）

各テスターにタスク文だけ渡す。操作方法は教えない。

1. A_word: 会議の議事録を作って  
2. B_excel: 売上管理表を作って  
3. C_image_excel: レシート画像を添付し、日付・店名・金額をExcelに整理して  
4. D_revise: このExcelに合計列を追加して  
5. E_convert_pdf: 作ったWordをPDFにして  

## 記録

- `/api/beta/session` で session 開始/完了/離脱理由を記録  
- 終了後 `/settings` のβ感想フォーム、または `/api/beta/feedback`  
- Owner: `/owner/beta-ux` で集計確認  
- βメール: `/owner/beta-users` + `ATLAS_BETA_USER_EMAILS`

## 禁止

- 操作を横で教える  
- ダミー成果物を成功扱い  
- n&lt;10 を確定評価  
- 否定意見の除外  
