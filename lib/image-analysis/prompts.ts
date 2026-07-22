import type { ImageDocumentType } from "./types";

const SHARED_RULES = `
あなたは画像から構造化データを抽出する専属AI秘書です。
必ず次を守ってください:
- 画像に書かれていない内容を推測・創作しない
- 読めない文字は「判読不能」、不明は「要確認」または null / 空欄
- 金額・日付・電話・メールは勝手に補正しない
- 出力は JSON オブジェクトのみ（Markdownや説明文は禁止）
- confidence は 0〜1
- requiresReview は判読不能・金額不一致の可能性があるとき true
`;

function schemaHint(documentType: ImageDocumentType): string {
  switch (documentType) {
    case "receipt":
      return `{
  "documentType": "receipt",
  "title": string,
  "confidence": number,
  "requiresReview": boolean,
  "sourceFileId": string|null,
  "sourceFiles": [],
  "createdAt": ISO8601,
  "warnings": string[],
  "fields": {
    "purchaseDate": "YYYY-MM-DD"|null,
    "purchaseTime": "HH:mm"|null,
    "storeName": string|null,
    "storeAddress": string|null,
    "taxAmount": number|null,
    "totalAmount": number|null,
    "paymentMethod": string|null
  },
  "rows": [{
    "name": string,
    "quantity": number|null,
    "unitPrice": number|null,
    "subtotal": number|null,
    "discount": number|null,
    "taxRate": number|null,
    "category": "食費"|"外食"|"日用品"|"交通費"|"ガソリン"|"医療費"|"娯楽費"|"衣服"|"仕事経費"|"その他"|"要確認",
    "note": string?
  }]
}`;
    case "invoice":
    case "estimate":
      return `{
  "documentType": "invoice"|"estimate",
  "title": string,
  "confidence": number,
  "requiresReview": boolean,
  "sourceFileId": string|null,
  "sourceFiles": [],
  "createdAt": ISO8601,
  "warnings": string[],
  "fields": {
    "documentKind": "invoice"|"estimate",
    "issueDate": string|null,
    "billingDate": string|null,
    "dueDate": string|null,
    "documentNumber": string|null,
    "issuerName": string|null,
    "recipientName": string|null,
    "postalCode": string|null,
    "address": string|null,
    "phone": string|null,
    "email": string|null,
    "subtotal": number|null,
    "taxAmount": number|null,
    "totalAmount": number|null,
    "bankAccount": string|null,
    "notes": string|null
  },
  "rows": [{
    "name": string,
    "quantity": number|null,
    "unitPrice": number|null,
    "amount": number|null,
    "note": string?
  }]
}`;
    case "business_card":
      return `{
  "documentType": "business_card",
  "title": string,
  "confidence": number,
  "requiresReview": boolean,
  "sourceFileId": string|null,
  "sourceFiles": [],
  "createdAt": ISO8601,
  "warnings": string[],
  "fields": {
    "contacts": [{
      "fullName": string|null,
      "fullNameKana": string|null,
      "company": string|null,
      "department": string|null,
      "title": string|null,
      "postalCode": string|null,
      "address": string|null,
      "phone": string|null,
      "mobile": string|null,
      "fax": string|null,
      "email": string|null,
      "website": string|null,
      "sns": string|null,
      "note": string?,
      "sourceFileId": string|null
    }]
  },
  "rows": []
}`;
    case "handwritten":
      return `{
  "documentType": "handwritten",
  "title": string,
  "confidence": number,
  "requiresReview": boolean,
  "sourceFileId": string|null,
  "sourceFiles": [],
  "createdAt": ISO8601,
  "warnings": string[],
  "fields": {
    "transcript": string,
    "cleanedText": string,
    "unclearSpans": string[]
  },
  "rows": [{
    "title": string,
    "assignee": string|null,
    "dueDate": string|null,
    "priority": "high"|"medium"|"low"|"要確認"|null,
    "note": string?
  }]
}`;
    case "table":
    default:
      return `{
  "documentType": "table",
  "title": string,
  "confidence": number,
  "requiresReview": boolean,
  "sourceFileId": string|null,
  "sourceFiles": [],
  "createdAt": ISO8601,
  "warnings": string[],
  "fields": {
    "columns": string[],
    "notes": string?
  },
  "rows": [ { "<column>": string|number|null } ]
}`;
  }
}

export function buildExtractionInstructions(
  documentType: ImageDocumentType,
): string {
  return `${SHARED_RULES}

対象ドキュメント種別: ${documentType}
出力JSONスキーマ:
${schemaHint(documentType)}
`;
}

export function buildExtractionUserPrompt(input: {
  assignment: string;
  documentType: ImageDocumentType;
  sourceFileIds: string[];
}): string {
  return [
    "次の添付画像を解析し、指定スキーマのJSONだけを返してください。",
    `希望ドキュメント種別: ${input.documentType}`,
    `sourceFileId候補: ${input.sourceFileIds.join(", ") || "(なし)"}`,
    "",
    "ユーザー依頼:",
    input.assignment.trim(),
  ].join("\n");
}

export function buildRepairPrompt(input: {
  documentType: ImageDocumentType;
  invalidJson: string;
  validationError: string;
}): string {
  return [
    "前回のJSONはスキーマ検証に失敗しました。同じ画像内容に基づき、修正したJSONだけを再出力してください。",
    "内容の創作・補完は禁止。不明は要確認/判読不能/null。",
    `documentType: ${input.documentType}`,
    `検証エラー: ${input.validationError}`,
    "不正だったJSON:",
    input.invalidJson.slice(0, 6000),
  ].join("\n");
}
