import "server-only";

import { VisionError } from "@/lib/vision/types";

export type ImageDeliveryCheck = {
  ok: boolean;
  issues: string[];
  mimeType: string | null;
  byteSize: number;
  deliveryMethod: "url" | "base64" | "file_id";
};

/**
 * Pre-OpenAI delivery checks (no network fetch of private signed URLs here —
 * signed URL expiry is detected when fetch/OpenAI returns 403/404).
 */
export function validateImageDelivery(input: {
  mimeType?: string | null;
  byteSize: number;
  deliveryMethod: "url" | "base64" | "file_id";
  imageUrl?: string | null;
  base64Length?: number | null;
}): ImageDeliveryCheck {
  const issues: string[] = [];
  const mimeType = input.mimeType ?? null;

  if (input.byteSize <= 0) {
    issues.push("empty_file");
  }
  if (
    mimeType &&
    mimeType !== "image/jpeg" &&
    mimeType !== "image/png" &&
    mimeType !== "image/webp"
  ) {
    issues.push("invalid_mime");
  }
  if (input.deliveryMethod === "url" && input.imageUrl) {
    try {
      const url = new URL(input.imageUrl);
      // Heuristic: expired signed URLs often carry X-Amz-Expires / token.
      const expires = url.searchParams.get("X-Amz-Expires");
      const date = url.searchParams.get("X-Amz-Date");
      if (expires && date) {
        // Basic ISO-ish parse of Amz date YYYYMMDDTHHMMSSZ
        const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(date);
        if (m) {
          const started = Date.UTC(
            Number(m[1]),
            Number(m[2]) - 1,
            Number(m[3]),
            Number(m[4]),
            Number(m[5]),
            Number(m[6]),
          );
          const ttlMs = Number(expires) * 1000;
          if (Number.isFinite(ttlMs) && Date.now() > started + ttlMs) {
            issues.push("signed_url_expired");
          }
        }
      }
    } catch {
      issues.push("invalid_url");
    }
  }
  if (
    input.deliveryMethod === "base64" &&
    typeof input.base64Length === "number" &&
    input.base64Length > 0 &&
    input.byteSize > 0
  ) {
    // base64 length should be ~ 4/3 of bytes (±padding).
    const expectedMin = Math.floor((input.byteSize * 4) / 3) - 8;
    if (input.base64Length < expectedMin) {
      issues.push("base64_truncated");
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    mimeType,
    byteSize: input.byteSize,
    deliveryMethod: input.deliveryMethod,
  };
}

export function assertImageDeliveryOrThrow(
  check: ImageDeliveryCheck,
  diagnosticId?: string | null,
): void {
  if (check.ok) return;
  if (check.issues.includes("empty_file")) {
    throw new VisionError("empty_image", "解析用画像が空です", {
      diagnosticId,
      failedStage: "storage_download",
      details: { safeMessage: "empty_file", byteSize: check.byteSize },
    });
  }
  if (check.issues.includes("signed_url_expired")) {
    throw new VisionError("storage_failed", "画像URLの有効期限が切れています", {
      diagnosticId,
      failedStage: "storage_download",
      details: { safeMessage: "signed_url_expired" },
    });
  }
  if (check.issues.includes("invalid_mime")) {
    throw new VisionError(
      "unsupported_type",
      "画像の形式を確認できませんでした。JPEGまたはPNGで送り直してください",
      {
        diagnosticId,
        failedStage: "preprocess",
        details: {
          safeMessage: "invalid_mime",
          mimeType: check.mimeType,
        },
      },
    );
  }
  if (check.issues.includes("base64_truncated")) {
    throw new VisionError("invalid_data_url", "画像データが途中で欠けています", {
      diagnosticId,
      failedStage: "data_url",
      details: { safeMessage: "base64_truncated" },
    });
  }
  throw new VisionError("corrupt_image", "画像データを確認できませんでした", {
    diagnosticId,
    failedStage: "preprocess",
    details: { safeMessage: check.issues.join(",") },
  });
}
