import "server-only";

/**
 * Forensic checks for data URL / Base64 corruption patterns that produce
 * OpenAI 400: "The image data you provided does not represent a valid image."
 */

export type DataUrlIntegrityIssue = {
  code: string;
  message: string;
};

export type DataUrlIntegrityReport = {
  ok: boolean;
  issues: DataUrlIntegrityIssue[];
  header: string | null;
  mimeType: string | null;
  base64Length: number | null;
  decodedByteLength: number | null;
  hasWhitespaceInBase64: boolean;
  hasDataPrefixDuplicate: boolean;
  looksDoubleBase64Encoded: boolean;
  plusBecameSpace: boolean;
  urlEncoded: boolean;
  jsonBufferShape: boolean;
};

function looksLikeJsonBuffer(value: unknown): boolean {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Buffer.isBuffer(value) &&
    (value as { type?: string }).type === "Buffer" &&
    Array.isArray((value as { data?: unknown }).data)
  );
}

/** Inspect a data URL string for structural corruption (not magic-byte validity). */
export function inspectDataUrlIntegrity(
  dataUrl: unknown,
): DataUrlIntegrityReport {
  const issues: DataUrlIntegrityIssue[] = [];

  if (looksLikeJsonBuffer(dataUrl)) {
    return {
      ok: false,
      issues: [
        {
          code: "json_buffer_shape",
          message:
            "値が JSON Buffer 形状 {type:'Buffer',data:[]} — Base64文字列ではない",
        },
      ],
      header: null,
      mimeType: null,
      base64Length: null,
      decodedByteLength: null,
      hasWhitespaceInBase64: false,
      hasDataPrefixDuplicate: false,
      looksDoubleBase64Encoded: false,
      plusBecameSpace: false,
      urlEncoded: false,
      jsonBufferShape: true,
    };
  }

  if (typeof dataUrl !== "string") {
    return {
      ok: false,
      issues: [
        {
          code: "not_string",
          message: `data URL が string ではない (typeof=${typeof dataUrl})`,
        },
      ],
      header: null,
      mimeType: null,
      base64Length: null,
      decodedByteLength: null,
      hasWhitespaceInBase64: false,
      hasDataPrefixDuplicate: false,
      looksDoubleBase64Encoded: false,
      plusBecameSpace: false,
      urlEncoded: false,
      jsonBufferShape: false,
    };
  }

  const hasDataPrefixDuplicate =
    (dataUrl.match(/data:image\//gi) ?? []).length > 1 ||
    dataUrl.includes("base64,data:image");
  if (hasDataPrefixDuplicate) {
    issues.push({
      code: "duplicate_data_prefix",
      message: "data:image/...;base64, が重複（data URL の二重ラップ）",
    });
  }

  const urlEncoded =
    /%2[fF]|%2[bB]|%3[dD]|%0[aA]|%20/.test(dataUrl) ||
    dataUrl.includes("data%3Aimage");
  if (urlEncoded) {
    issues.push({
      code: "url_encoded",
      message: "data URL が URL エンコードされている",
    });
  }

  const comma = dataUrl.indexOf(",");
  const header = comma >= 0 ? dataUrl.slice(0, comma) : dataUrl.slice(0, 80);
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : "";

  const mimeMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64$/i.exec(header.trim());
  const mimeType = mimeMatch?.[1]?.toLowerCase() ?? null;
  if (!mimeMatch) {
    issues.push({
      code: "bad_header",
      message: `ヘッダが data:image/(jpeg|png);base64 ではない: ${header.slice(0, 80)}`,
    });
  } else if (mimeType === "image/jpg") {
    issues.push({
      code: "nonstandard_mime_jpg",
      message: "image/jpg は非標準。OpenAI は image/jpeg を期待する可能性",
    });
  } else if (mimeType !== "image/jpeg" && mimeType !== "image/png") {
    issues.push({
      code: "unsupported_mime_for_send",
      message: `送信許可外 MIME: ${mimeType}`,
    });
  }

  const hasWhitespaceInBase64 = /[\s]/.test(payload);
  if (hasWhitespaceInBase64) {
    issues.push({
      code: "whitespace_in_base64",
      message: "Base64 ペイロードに空白/改行が混入",
    });
  }

  if (/["'<>\\]/.test(payload)) {
    issues.push({
      code: "quotes_in_base64",
      message: "Base64 に引用符や <>\\ が混入",
    });
  }

  // "+" turned into space (classic form-encoding corruption)
  const plusBecameSpace =
    payload.includes(" ") &&
    !payload.includes("+") &&
    /^[A-Za-z0-9/ =\n\r\t]+$/.test(payload);
  if (plusBecameSpace) {
    issues.push({
      code: "plus_became_space",
      message: "Base64 の + が空白に化けている可能性（form-urlencoded 破損）",
    });
  }

  if (!payload || payload.length < 32) {
    issues.push({
      code: "base64_missing_or_truncated",
      message: "base64, 以降が欠落または極端に短い",
    });
  }

  const cleaned = payload.replace(/\s+/g, "");
  let decoded: Buffer | null = null;
  try {
    decoded = Buffer.from(cleaned, "base64");
  } catch {
    issues.push({ code: "base64_decode_failed", message: "Base64 デコード失敗" });
  }

  // Double-encoding: decoded UTF-8 text starts with data:image or looks like base64 of JPEG
  let looksDoubleBase64Encoded = false;
  if (decoded && decoded.length > 16) {
    const asUtf8 = decoded.toString("utf8");
    if (asUtf8.startsWith("data:image") || asUtf8.startsWith("/9j/") || asUtf8.startsWith("iVBOR")) {
      looksDoubleBase64Encoded = true;
      issues.push({
        code: "double_base64",
        message:
          "デコード結果が data URL または Base64 文字列 — 二重 Base64 化の疑い",
      });
    }
  }

  // Round-trip: re-encode should match cleaned (padding aside)
  if (decoded && cleaned.length >= 32) {
    const re = decoded.toString("base64").replace(/=+$/, "");
    const orig = cleaned.replace(/=+$/, "");
    if (re !== orig && Math.abs(re.length - orig.length) > 4) {
      issues.push({
        code: "base64_roundtrip_drift",
        message: "Base64 往復で長さが大きくずれた（破損の可能性）",
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    header,
    mimeType,
    base64Length: cleaned.length,
    decodedByteLength: decoded?.length ?? null,
    hasWhitespaceInBase64,
    hasDataPrefixDuplicate,
    looksDoubleBase64Encoded,
    plusBecameSpace,
    urlEncoded,
    jsonBufferShape: false,
  };
}

/** True when a value looks like a JSON-serialized Node Buffer. */
export function isJsonSerializedBuffer(value: unknown): boolean {
  return looksLikeJsonBuffer(value);
}

/** Recover bytes if a Buffer was accidentally JSON-serialized. */
export function bufferFromPossiblySerialized(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (looksLikeJsonBuffer(value)) {
    return Buffer.from((value as { data: number[] }).data);
  }
  return null;
}
