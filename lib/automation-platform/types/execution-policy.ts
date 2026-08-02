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
};

export const DEFAULT_EXECUTION_POLICY: AutomationExecutionPolicy = {
  mode: "review_before_run",
  approvalTimeoutMs: null,
  onApprovalTimeout: "cancel",
  selectedStepIds: [],
  systemHighRiskOverride: true,
};
