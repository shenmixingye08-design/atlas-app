/**
 * Phase 3-1 — Fail-closed outcome matrix for V2 Automation vs legacy/UI paths.
 */

import type { FailClosedCaseAudit } from "./types";

/**
 * V2 outcomes are from strictStepInvoker + executor rejectFakeSuccess.
 * Legacy/UI outcomes describe current non-V2 provider clients where applicable.
 */
export const FAIL_CLOSED_MATRIX: readonly FailClosedCaseAudit[] = [
  {
    caseId: "adapter_unregistered",
    v2AutomationOutcome: "failed",
    legacyOrUiOutcome: "failed",
    notes: "V2: step_not_implemented / live_adapter_missing. No silent success.",
  },
  {
    caseId: "token_missing",
    v2AutomationOutcome: "needs_configuration",
    legacyOrUiOutcome: "needs_configuration",
    notes: "V2: automation_integration_required / notConnected when app unconfigured.",
  },
  {
    caseId: "token_expired",
    v2AutomationOutcome: "failed",
    legacyOrUiOutcome: "retry",
    notes:
      "UI Google/X/Dropbox attempt refresh; V2 never reaches provider (unwired).",
  },
  {
    caseId: "token_revoked",
    v2AutomationOutcome: "failed",
    legacyOrUiOutcome: "needs_configuration",
    notes: "Provider 401 after revoke → reconnect needed on UI paths.",
  },
  {
    caseId: "scope_missing",
    v2AutomationOutcome: "failed",
    legacyOrUiOutcome: "failed",
    notes: "Should be needs_configuration; diagnostics incomplete (P1).",
  },
  {
    caseId: "provider_401",
    v2AutomationOutcome: "failed",
    legacyOrUiOutcome: "needs_configuration",
    notes: "Non-retryable on well-behaved paths; generic withRetry may still retry.",
  },
  {
    caseId: "provider_403",
    v2AutomationOutcome: "failed",
    legacyOrUiOutcome: "failed",
    notes: "Forbidden / missing permission.",
  },
  {
    caseId: "provider_404",
    v2AutomationOutcome: "failed",
    legacyOrUiOutcome: "failed",
    notes: "Not found treated as failure.",
  },
  {
    caseId: "provider_409",
    v2AutomationOutcome: "failed",
    legacyOrUiOutcome: "unknown",
    notes: "Conflict handling provider-specific; Calendar/WP weak.",
  },
  {
    caseId: "provider_429",
    v2AutomationOutcome: "retry",
    legacyOrUiOutcome: "retry",
    notes: "V2 retry-policy patterns include 429; X uses circuit breaker + retry.",
  },
  {
    caseId: "provider_5xx",
    v2AutomationOutcome: "retry",
    legacyOrUiOutcome: "retry",
    notes: "Retryable by message patterns / withRetry.",
  },
  {
    caseId: "timeout",
    v2AutomationOutcome: "retry",
    legacyOrUiOutcome: "retry",
    notes: "automation_timeout classified retryable.",
  },
  {
    caseId: "network_failure",
    v2AutomationOutcome: "retry",
    legacyOrUiOutcome: "retry",
    notes: "ECONNRESET/ENOTFOUND/network patterns.",
  },
  {
    caseId: "provider_api_unreachable",
    v2AutomationOutcome: "failed",
    legacyOrUiOutcome: "failed",
    notes: "V2 external gate never calls provider; UI path fails fetch.",
  },
  {
    caseId: "external_action_id_missing",
    v2AutomationOutcome: "failed",
    legacyOrUiOutcome: "unknown",
    notes:
      "V2 executor rejectFakeSuccess → external_action_id_required. UI may return ids without V2 evidence.",
  },
  {
    caseId: "external_url_missing",
    v2AutomationOutcome: "failed",
    legacyOrUiOutcome: "unknown",
    notes:
      "When completionRequirements include artifact_with_url, missing URL fails. Gmail may succeed without URL.",
  },
  {
    caseId: "response_schema_invalid",
    v2AutomationOutcome: "failed",
    legacyOrUiOutcome: "failed",
    notes: "X throws if tweet data missing; Drive throws without id.",
  },
] as const;

/** Cases that must never resolve to success on V2. */
export const V2_FORBIDDEN_SUCCESS_CASES = FAIL_CLOSED_MATRIX.filter(
  (entry) => entry.v2AutomationOutcome === "success",
);
