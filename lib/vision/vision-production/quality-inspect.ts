/**
 * Vision 解析後の品質検査。
 * DocumentType / Confidence / OCR精度 / 必須項目 / 成果物準備 / 破損 / タイムアウト / Retry
 */

import type {
  VisionAnalysisResult,
  VisionDetectedType,
} from "@/lib/vision/types";
import { estimateOcrAccuracy } from "@/lib/vision/vision-production/ocr-fields";
import type { ImageQualityAssessment } from "@/lib/vision/vision-production/image-quality";

export type VisionQualityIssueCode =
  | "low_confidence"
  | "low_ocr_accuracy"
  | "missing_required_fields"
  | "empty_ocr"
  | "image_too_dark"
  | "image_blurry"
  | "image_skewed"
  | "partial_crop"
  | "timeout"
  | "retry_exhausted"
  | "corrupt_image"
  | "deliverable_not_ready";

export type VisionQualityIssue = {
  code: VisionQualityIssueCode;
  message: string;
  severity: "info" | "warn" | "error";
};

export type VisionQualityReport = {
  documentType: VisionDetectedType;
  confidence: number;
  ocrAccuracy: number;
  requiredFields: string[];
  missingRequiredFields: string[];
  deliverableReady: boolean;
  recommendedFormats: string[];
  issues: VisionQualityIssue[];
  imageQuality: ImageQualityAssessment | null;
  timedOut: boolean;
  retryCount: number;
  passed: boolean;
};

const REQUIRED_BY_TYPE: Record<VisionDetectedType, string[]> = {
  receipt: ["date", "total"],
  receipt_voucher: ["date", "total"],
  invoice: ["date", "total", "companyName"],
  delivery_note: ["date", "companyName"],
  estimate: ["total"],
  contract: ["companyName"],
  business_document: [],
  sales_material: [],
  table: [],
  spreadsheet_source: [],
  chart: [],
  handwritten_note: [],
  business_card: ["name"],
  whiteboard: [],
  screenshot: [],
  meeting_minutes: [],
  property_photo: [],
  equipment_photo: [],
  construction_photo: [],
  identity_document: ["name"],
  social_media_reference: [],
  design_reference: [],
  general_photo: [],
  unknown: [],
};

function hasField(fields: VisionAnalysisResult["fields"], key: string): boolean {
  const aliases: Record<string, string[]> = {
    total: ["total", "amount", "amountTaxIncluded", "合計"],
    companyName: ["companyName", "company", "issuer", "会社名", "storeName"],
    name: ["name", "personName", "fullName", "氏名"],
    date: ["date", "issueDate", "purchaseDate", "日付"],
  };
  const keys = aliases[key] ?? [key];
  return keys.some((k) => {
    const v = fields[k];
    return v != null && String(v).trim() !== "" && String(v) !== "要確認";
  });
}

/**
 * 解析結果の品質検査レポートを生成する。
 */
export function inspectVisionQuality(input: {
  result: VisionAnalysisResult;
  imageQuality?: ImageQualityAssessment | null;
  timedOut?: boolean;
  retryCount?: number;
  recommendedFormats?: string[];
}): VisionQualityReport {
  const { result } = input;
  const required = REQUIRED_BY_TYPE[result.detectedType] ?? [];
  const missing = required.filter((k) => !hasField(result.fields, k));
  const ocrAccuracy = estimateOcrAccuracy(
    result.extractedText,
    result.fields,
    required,
  );

  const issues: VisionQualityIssue[] = [];
  if (result.confidence < 0.55) {
    issues.push({
      code: "low_confidence",
      message: `分類信頼度が低いです（${result.confidence}）`,
      severity: "warn",
    });
  }
  if (ocrAccuracy < 0.45) {
    issues.push({
      code: "low_ocr_accuracy",
      message: `OCR精度が低いです（${ocrAccuracy}）`,
      severity: "warn",
    });
  }
  if (missing.length > 0) {
    issues.push({
      code: "missing_required_fields",
      message: `必須項目が不足: ${missing.join(", ")}`,
      severity: "warn",
    });
  }
  if (!result.extractedText?.trim() && Object.keys(result.fields).length === 0) {
    issues.push({
      code: "empty_ocr",
      message: "OCRテキストが空です",
      severity: "error",
    });
  }
  if (input.timedOut) {
    issues.push({
      code: "timeout",
      message: "解析がタイムアウトしました",
      severity: "error",
    });
  }
  if ((input.retryCount ?? 0) >= 3) {
    issues.push({
      code: "retry_exhausted",
      message: "リトライ上限に達しました",
      severity: "error",
    });
  }

  const iq = input.imageQuality ?? null;
  if (iq) {
    if (iq.tooDark) {
      issues.push({
        code: "image_too_dark",
        message: "画像が暗いです",
        severity: "info",
      });
    }
    if (iq.likelyBlurry) {
      issues.push({
        code: "image_blurry",
        message: "画像がぼやけています",
        severity: "info",
      });
    }
    if (Math.abs(iq.skewHintDeg) >= 3) {
      issues.push({
        code: "image_skewed",
        message: "画像が傾いています",
        severity: "info",
      });
    }
    if (iq.small) {
      issues.push({
        code: "partial_crop",
        message: "画像が小さい／一部切れている可能性があります",
        severity: "info",
      });
    }
  }

  const formats = input.recommendedFormats ?? [];
  const deliverableReady =
    formats.length > 0 &&
    (Boolean(result.extractedText?.trim()) ||
      Object.keys(result.fields).length > 0 ||
      Boolean(result.summary?.trim()));

  if (!deliverableReady) {
    issues.push({
      code: "deliverable_not_ready",
      message: "成果物生成に必要な情報が不足しています",
      severity: "error",
    });
  }

  const hasError = issues.some((i) => i.severity === "error");

  return {
    documentType: result.detectedType,
    confidence: result.confidence,
    ocrAccuracy,
    requiredFields: required,
    missingRequiredFields: missing,
    deliverableReady,
    recommendedFormats: formats,
    issues,
    imageQuality: iq,
    timedOut: Boolean(input.timedOut),
    retryCount: input.retryCount ?? 0,
    passed: !hasError && result.confidence >= 0.4 && ocrAccuracy >= 0.3,
  };
}
