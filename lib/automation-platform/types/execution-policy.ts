/**
 * User-selectable execution modes.
 * System safety rules for high-risk steps always override "full auto".
 */
export type ExecutionPolicyMode =
  | "review_before_run"
  | "run_then_notify"
  | "review_selected_steps"
  | "approve_first_then_auto"
  | "review_high_risk_only"
  /** 投稿（X）だけ確認 */
  | "review_post_only"
  /** 送信（メール）だけ確認 */
  | "review_send_only";

export type ApprovalTimeoutAction = "skip" | "cancel" | "run";

export type AutomationExecutionPolicy = {
  mode: ExecutionPolicyMode;
  /** ISO duration or ms number serialized as number — null = no timeout */
  approvalTimeoutMs: number | null;
  onApprovalTimeout: ApprovalTimeoutAction;
  /**
   * Step ids that require approval when mode is review_selected_steps.
   * Ignored for other modes (high-risk still enforced by system).
   */
  selectedStepIds: string[];
  /**
   * Hard safety: even if mode is run_then_notify / approve_first_then_auto,
   * high-risk capabilities cannot bypass system approval.
   */
  systemHighRiskOverride: true;
  /**
   * User explicitly chose unattended execution for THIS automation
   * (「自動で実行」). Does not disable high-risk checks globally.
   */
  userAuthorizedUnattendedHighRisk?: boolean;
};

export const DEFAULT_EXECUTION_POLICY: AutomationExecutionPolicy = {
  mode: "review_before_run",
  approvalTimeoutMs: null,
  onApprovalTimeout: "cancel",
  selectedStepIds: [],
  systemHighRiskOverride: true,
  userAuthorizedUnattendedHighRisk: false,
};

/** V1 実行レベル → V2 policy。full_auto はユーザー明示の無人実行として扱う。 */
export function executionPolicyFromV1Level(
  level:
    | "suggest_only"
    | "draft_save"
    | "approve_then_run"
    | "full_auto"
    | "draft_only"
    | "prepare_only",
): {
  mode: ExecutionPolicyMode;
  userAuthorizedUnattendedHighRisk: boolean;
} {
  if (level === "full_auto") {
    return {
      mode: "run_then_notify",
      userAuthorizedUnattendedHighRisk: true,
    };
  }
  return {
    mode: "review_before_run",
    userAuthorizedUnattendedHighRisk: false,
  };
}
