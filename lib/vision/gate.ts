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
    | "ok";
  requiredFields: string[];
  missingRequiredFields: string[];
};

const POISON_PATTERNS = [
  /ファイルの中身はまだ自動取得できません/,
  /添付画像の中身を自動取得できなかった/,
  /ファイル名を参考に作業/,
  /contentAvailable:\s*false/i,
];

/** Remove legacy client notes that instruct the model to ignore image content. */
export function stripVisionPoisonText(assignment: string): string {
  return assignment
    .split("\n")
    .filter((line) => !POISON_PATTERNS.some((re) => re.test(line)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
