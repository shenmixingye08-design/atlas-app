import type { ArtifactFailureClass } from "@/lib/artifact-durability/types";

export function classifyArtifactFailure(input: {
  stage?: string | null;
  message?: string | null;
  structureOk?: boolean;
  zeroByte?: boolean;
  envMissing?: boolean;
}): ArtifactFailureClass {
  if (input.envMissing) return "env_missing";
  if (input.zeroByte) return "output_validation_failed";
  const msg = input.message ?? "";
  const stage = input.stage ?? "";

  if (stage === "generate" || /generat/i.test(msg)) return "generation_failed";
  if (stage === "structure" || input.structureOk === false) {
    if (/formula|#REF!/i.test(msg)) return "formula_validation_failed";
    if (/font/i.test(msg)) return "font_failed";
    if (/image|media|relationship/i.test(msg)) return "image_reference_failed";
    if (/overflow|layout/i.test(msg)) return "layout_overflow";
    return "invalid_file_structure";
  }
  if (stage === "storage" || /storage|upload|persist/i.test(msg)) {
    return "storage_upload_failed";
  }
  if (stage === "register" || /register|artifact_save|db/i.test(msg)) {
    return "artifact_save_failed";
  }
  if (stage === "preview") return "preview_failed";
  if (stage === "download") return "download_failed";
  if (stage === "revision") return "revision_failed";
  if (stage === "convert" || /convert/i.test(msg)) return "conversion_failed";
  if (/timeout/i.test(msg)) return "timeout";
  if (/too large|file_too_large/i.test(msg)) return "file_too_large";
  if (/permission|forbidden|401|403/i.test(msg)) return "permission_denied";
  if (/duplicate|idempoten/i.test(msg)) return "duplicate_request";
  if (/validat/i.test(msg)) return "output_validation_failed";
  return "unknown";
}
