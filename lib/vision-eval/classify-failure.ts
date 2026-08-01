import type { VisionFailureClass } from "@/lib/vision-eval/types";
import type { VisionError } from "@/lib/vision/types";

export function classifyVisionFailure(input: {
  error?: unknown;
  timedOut?: boolean;
  httpStatus?: number | null;
  schemaOk?: boolean;
  fieldHitRate?: number;
  ocrOk?: boolean;
  finalStatus?: string;
  lowConfidence?: boolean;
  artifactFailed?: boolean;
  envMissing?: boolean;
}): VisionFailureClass {
  if (input.envMissing) return "env_missing";

  if (
    input.timedOut &&
    (input.finalStatus === "needs_input" || input.finalStatus === "needsInput")
  ) {
    return "timeout_needs_input_misclassified";
  }

  const err = input.error as VisionError | Error | undefined;
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: string }).code ?? "")
      : "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  const status = input.httpStatus ?? null;

  if (code === "timeout" || input.timedOut || /timeout|timed out/i.test(message)) {
    return "openai_timeout";
  }
  if (
    code === "rate_limited" ||
    status === 429 ||
    /rate_limit|rate limit/i.test(message)
  ) {
    return "openai_rate_limit";
  }
  if (status != null && status >= 500) return "openai_5xx";
  if (
    status != null &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  ) {
    return "openai_4xx";
  }
  if (/econnreset|fetch failed|network|enotfound|socket/i.test(message)) {
    return "openai_network";
  }
  if (
    code === "storage_failed" ||
    code === "not_found" ||
    /storage_download|storage_read/i.test(message)
  ) {
    return "storage_read_failed";
  }
  if (code === "empty_image" || /upload/i.test(message)) {
    return "upload_failed";
  }
  if (
    code === "unsupported_type" ||
    code === "invalid_data_url" ||
    code === "corrupt_image" ||
    /invalid_image/i.test(message)
  ) {
    return "invalid_image";
  }
  if (code === "too_large" || /too large|image_too_large/i.test(message)) {
    return "image_too_large";
  }
  if (/preprocess/i.test(message)) return "preprocessing_failed";
  if (
    code === "json_parse_failed" ||
    input.schemaOk === false ||
    /schema/i.test(message)
  ) {
    return "schema_validation_failed";
  }
  if (input.lowConfidence) return "low_confidence";
  if (input.ocrOk === false) return "ocr_failed";
  if ((input.fieldHitRate ?? 1) < 0.5) return "required_fields_missing";
  if (input.artifactFailed) return "artifact_generation_failed";
  if (input.finalStatus === "needs_input") return "job_state_mismatch";

  if (!err && !input.timedOut) {
    // scoring failure without thrown error
    if (input.ocrOk === false) return "ocr_failed";
    if ((input.fieldHitRate ?? 1) < 0.5) return "required_fields_missing";
  }

  return "unknown";
}
