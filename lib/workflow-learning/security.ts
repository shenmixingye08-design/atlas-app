import type { WorkflowLearningPatch } from "@/lib/workflow-learning/types";

const SECRET_KEYS = [
  "token",
  "secret",
  "password",
  "apiKey",
  "apikey",
  "authorization",
  "refreshToken",
  "accessToken",
  "privateKey",
];

const INJECTION_MARKERS = [
  "ignore previous",
  "system prompt",
  "you are now",
  "disregard",
  "<script",
];

/** Strip secrets and injection attempts from user-facing / stored text. */
export function sanitizeLearningText(input: string, max = 400): string {
  let text = input.replace(/\s+/g, " ").trim();
  for (const marker of INJECTION_MARKERS) {
    if (text.toLowerCase().includes(marker)) {
      text = text.replace(new RegExp(marker, "ig"), "[filtered]");
    }
  }
  for (const key of SECRET_KEYS) {
    const re = new RegExp(`${key}\\s*[:=]\\s*\\S+`, "ig");
    text = text.replace(re, `${key}=[redacted]`);
  }
  return text.slice(0, max);
}

export function assertNoSecretsInPatch(patch: WorkflowLearningPatch): void {
  const raw = JSON.stringify(patch).toLowerCase();
  for (const key of SECRET_KEYS) {
    if (raw.includes(`"${key}"`) || raw.includes(`${key}=`)) {
      throw new Error("workflow_learning_secret_in_patch");
    }
  }
}

/** External document content must never become learning evidence alone. */
export function isBlockedExternalDocumentSource(source: string | null | undefined): boolean {
  if (!source) return false;
  const s = source.toLowerCase();
  return (
    s.includes("uploaded_document") ||
    s.includes("external_document") ||
    s.includes("vision_ocr_full_text") ||
    s.includes("third_party_body")
  );
}

export function isHighRiskPatch(patch: WorkflowLearningPatch): boolean {
  if (patch.kind === "notification_policy") return true;
  if (patch.kind === "execution_policy") {
    const mode = patch.executionPolicy.mode;
    if (mode === "run_then_notify" || mode === "approve_first_then_auto") {
      return true;
    }
  }
  if (patch.kind === "schedule_shift_minutes") return false;
  if (patch.kind === "step_enabled" && patch.enabled === false) return false;
  return false;
}

/** Patches that change external send/publish conditions — never silent, never trial without confirm. */
export function touchesExternalSend(patch: WorkflowLearningPatch): boolean {
  if (patch.kind === "execution_policy") {
    const mode = patch.executionPolicy.mode;
    return (
      mode === "run_then_notify" ||
      mode === "review_post_only" ||
      mode === "review_send_only" ||
      mode === "approve_first_then_auto"
    );
  }
  if (patch.kind === "notification_policy") return true;
  return false;
}

export class WorkflowLearningError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unauthorized"
      | "forbidden"
      | "not_found"
      | "invalid"
      | "flag_off"
      | "high_risk"
      | "conflict",
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "WorkflowLearningError";
  }
}
