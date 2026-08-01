import type { VisionAnalysisResult, VisionBatchResult } from "@/lib/vision/types";

export type VisionGateStatus =
  | "vision_failed"
  | "needs_image_retry"
  | "needs_input"
  | "config_missing"
  | "ok";

export type VisionGateDecision = {
  status: VisionGateStatus;
  analysisSuccess: boolean;
  message: string;
  /** User-facing category (no internals). */
  userCode:
    | "image_fetch_failed"
    | "image_analyze_failed"
    | "image_format_invalid"
    | "ai_analyze_failed"
    | "schema_failed"
    | "config_missing"
    | "needs_input"
    | "missing_attachment_ids"
    | "ok";
  requiredFields: string[];
  missingRequiredFields: string[];
};

const POISON_PATTERNS = [
  /ファイルの中身はまだ自動取得できません/,
  /添付画像の中身を自動取得できなかった/,
  /添付画像（.+）が自動取得できない/,
  /自動取得できない/,
  /画像が未取得/,
  /画像確認要/,
  /ファイル名を参考/,
  /確認テンプレート/,
  /contentAvailable:\s*false/i,
  /^【添付】\s*$/,
  /^- .+\.(jpe?g|png|webp|heic|gif)\b/i,
];

const IMAGE_WORK_PATTERNS = [
  /レシート/,
  /領収書/,
  /家計簿/,
  /請求書/,
  /名刺/,
  /手書き/,
  /画像を/,
  /写真を/,
  /添付画像/,
  /読み取/,
  /OCR/i,
  /\.(jpe?g|png|webp|heic)\b/i,
  /「[^」]+\.(jpe?g|png|webp|heic)」/i,
];

/** Remove legacy client notes that instruct the model to ignore image content. */
export function stripVisionPoisonText(assignment: string): string {
  return assignment
    .split("\n")
    .filter((line) => !POISON_PATTERNS.some((re) => re.test(line)))
    .join("\n")
    // Home upload used to embed 「4830.jpg」はレシートです — strip quoted image filenames.
    .replace(/「[^」]+\.(jpe?g|png|webp|heic|gif)」/gi, "添付画像")
    .replace(/\b[\w.-]+\.(jpe?g|png|webp|heic|gif)\b/gi, "添付画像")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when the request clearly depends on image content. */
export function assignmentImpliesImageWork(text: string): boolean {
  return IMAGE_WORK_PATTERNS.some((re) => re.test(text));
}

/**
 * Infer required extraction fields from the user request.
 * Example: 「氏名と住所を抽出」→ name, address
 */
export function inferRequiredVisionFields(userText: string): string[] {
  const text = userText;
  const required: string[] = [];
  if (/氏名|名前|name/i.test(text)) required.push("name");
  if (/住所|address/i.test(text)) required.push("address");
  if (/会社名|company/i.test(text)) required.push("companyName");
  if (/電話|tel|phone/i.test(text)) required.push("phone");
  if (/メール|email/i.test(text)) required.push("email");
  return required;
}

function fieldPresent(fields: Record<string, unknown>, key: string): boolean {
  const aliases: Record<string, string[]> = {
    name: ["name", "personName", "fullName", "氏名", "名前"],
    address: ["address", "住所"],
    companyName: ["companyName", "company", "会社名", "issuer"],
    phone: ["phone", "tel", "電話", "telephone"],
    email: ["email", "mail", "メール"],
    storeName: ["storeName", "store", "shopName", "店名"],
    date: ["date", "purchaseDate", "issueDate", "購入日", "日付"],
    total: ["total", "amount", "合計", "totalAmount"],
  };
  const keys = aliases[key] ?? [key];
  for (const candidate of keys) {
    const value = fields[candidate];
    if (value == null) continue;
    if (typeof value === "string" && value.trim() && value !== "要確認") {
      return true;
    }
    if (typeof value === "number") return true;
  }
  return false;
}

function receiptSignalCount(fields: Record<string, unknown>): number {
  let count = 0;
  if (fieldPresent(fields, "storeName")) count += 1;
  if (fieldPresent(fields, "date")) count += 1;
  if (fieldPresent(fields, "total")) count += 1;
  const items = fields.items;
  if (Array.isArray(items) && items.length > 0) count += 1;
  return count;
}

export function evaluateMissingAttachmentIdsGate(input: {
  assignment: string;
  attachmentIds: string[];
  metadataAttachments?: unknown;
}): VisionGateDecision | null {
  if (input.attachmentIds.length > 0) return null;

  const metaList = Array.isArray(input.metadataAttachments)
    ? input.metadataAttachments
    : [];
  const hasImageMeta = metaList.some((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as { kind?: unknown; mimeType?: unknown; name?: unknown };
    if (row.kind === "photo") return true;
    if (typeof row.mimeType === "string" && row.mimeType.startsWith("image/")) {
      return true;
    }
    if (typeof row.name === "string" && /\.(jpe?g|png|webp|heic|gif)$/i.test(row.name)) {
      return true;
    }
    return false;
  });

  if (!hasImageMeta && !assignmentImpliesImageWork(input.assignment)) {
    return null;
  }

  return {
    status: "needs_image_retry",
    analysisSuccess: false,
    message: "画像の内容を解析できませんでした",
    userCode: "missing_attachment_ids",
    requiredFields: [],
    missingRequiredFields: [],
  };
}

export function evaluateVisionBatchGate(input: {
  batch: VisionBatchResult;
  userText: string;
}): VisionGateDecision {
  const requiredFields = inferRequiredVisionFields(input.userText);
  const images = input.batch.images;
  if (images.length === 0) {
    return {
      status: "vision_failed",
      analysisSuccess: false,
      message: "画像の内容を解析できませんでした",
      userCode: "image_analyze_failed",
      requiredFields,
      missingRequiredFields: requiredFields,
    };
  }

  const mergedFields: Record<string, unknown> = {};
  for (const image of images) {
    Object.assign(mergedFields, image.fields);
  }

  const isReceiptWork =
    /レシート|家計簿|領収書/i.test(input.userText) ||
    images.some(
      (image) =>
        image.detectedType === "receipt" ||
        image.detectedType === "receipt_voucher",
    ) ||
    input.batch.recommendedArtifactType === "household_excel";

  if (isReceiptWork && receiptSignalCount(mergedFields) < 2) {
    return {
      status: "needs_input",
      analysisSuccess: true,
      message: "画像内に該当情報を確認できませんでした",
      userCode: "needs_input",
      requiredFields: ["storeName", "date", "total"],
      missingRequiredFields: ["storeName", "date", "total"].filter(
        (key) => !fieldPresent(mergedFields, key),
      ),
    };
  }

  const missingRequiredFields = requiredFields.filter(
    (field) => !fieldPresent(mergedFields, field),
  );

  // Successful analysis but required fields absent in the image content.
  if (requiredFields.length > 0 && missingRequiredFields.length === requiredFields.length) {
    return {
      status: "needs_input",
      analysisSuccess: true,
      message: "画像内に該当情報を確認できませんでした",
      userCode: "needs_input",
      requiredFields,
      missingRequiredFields,
    };
  }

  if (input.batch.status === "needs_input" && (input.batch.needsInput?.fields.length ?? 0) > 0) {
    // Soft needs_input — allow artifact only when required extract fields are satisfied
    // or no hard required fields were requested.
    if (missingRequiredFields.length === 0) {
      return {
        status: "ok",
        analysisSuccess: true,
        message: "画像解析は完了しました（一部要確認）",
        userCode: "ok",
        requiredFields,
        missingRequiredFields: input.batch.needsInput?.fields ?? [],
      };
    }
  }

  return {
    status: "ok",
    analysisSuccess: true,
    message: "画像解析に成功しました",
    userCode: "ok",
    requiredFields,
    missingRequiredFields,
  };
}

export function summarizeImageForGate(image: VisionAnalysisResult): {
  hasExtractedSignal: boolean;
} {
  const hasText = Boolean(image.extractedText?.trim());
  const hasFields = Object.values(image.fields).some((value) => {
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });
  const hasTables = image.tables.some(
    (table) => table.headers.length > 0 || table.rows.length > 0,
  );
  return { hasExtractedSignal: hasText || hasFields || hasTables || Boolean(image.summary.trim()) };
}
