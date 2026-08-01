export type BetaPersona =
  | "ai_beginner"
  | "office_admin"
  | "sales"
  | "mobile_primary"
  | "pc_primary"
  | "file_novice"
  | "office_daily"
  | "wants_integrations";

export type BetaDeviceType = "mobile" | "tablet" | "desktop" | "unknown";

export type BetaFlowId =
  | "A_word"
  | "B_excel"
  | "C_image_excel"
  | "D_revise"
  | "E_convert_pdf"
  | "F_pptx"
  | "G_notification"
  | "H_external"
  | "I_automation";

export type DropoutReason =
  | "service_purpose_unclear"
  | "request_entry_unclear"
  | "attachment_ui_unclear"
  | "format_selection_unclear"
  | "too_many_questions"
  | "job_too_slow"
  | "progress_unclear"
  | "error_message_unclear"
  | "artifact_location_unclear"
  | "preview_unclear"
  | "download_unclear"
  | "revision_unclear"
  | "notification_missed"
  | "external_connection_unclear"
  | "mobile_layout_problem"
  | "authentication_problem"
  | "unsupported_request"
  | "result_quality_low"
  | "user_expected_different_output"
  | "technical_failure"
  | "unknown";

export type FindingSeverity = "Critical" | "High" | "Medium" | "Low";

export type PayIntent =
  | "definitely"
  | "probably"
  | "neutral"
  | "probably_not"
  | "no";

export type BetaSessionRecord = {
  sessionId: string;
  /** Opaque — email not stored on session row. */
  anonymousUserId: string;
  isBetaTester: boolean;
  personas: BetaPersona[];
  deviceType: BetaDeviceType;
  viewport: string | null;
  flowId: BetaFlowId;
  startedAt: string;
  endedAt: string | null;
  completed: boolean;
  downloaded: boolean;
  stuckScreen: string | null;
  dropoutReason: DropoutReason | null;
  requestId: string | null;
  jobId: string | null;
  artifactId: string | null;
  durationMs: number | null;
  clickCount: number | null;
  notes: string | null;
};

export type BetaFeedbackRecord = {
  id: string;
  sessionId: string | null;
  anonymousUserId: string;
  at: string;
  firstImpression: string | null;
  thoughtCouldAsk: string | null;
  mostConfused: string | null;
  mostUseful: string | null;
  mostWorried: string | null;
  resultMatchedExpectation: boolean | null;
  payIntent980: PayIntent | null;
  monthlyUseCase: string | null;
  whyNotChatgpt: string | null;
  wouldReuse: boolean | null;
  freeWouldUse: boolean | null;
  pay500: boolean | null;
  pay980: boolean | null;
  pay1500: boolean | null;
  payForWhat: string | null;
  breakEvenUses: number | null;
  freeText: string | null;
};

export type BetaFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  evidence: string;
  status: "open" | "fixed" | "mitigated";
  dropoutReason?: DropoutReason;
};

export type RateWithN = {
  rate: number | null;
  success: number;
  total: number;
  /** n < 10 → not definitive */
  definitive: boolean;
};

export type BetaMetricsSnapshot = {
  testerCount: number;
  sessions: number;
  signupCompleted: RateWithN;
  firstRequestSubmit: RateWithN;
  firstArtifactComplete: RateWithN;
  firstDownload: RateWithN;
  firstFlowComplete: RateWithN;
  reuse7d: RateWithN;
  durationMs: {
    avg: number | null;
    median: number | null;
    p90: number | null;
    p95: number | null;
    n: number;
  };
  byFlow: Record<string, RateWithN>;
  byDevice: Record<string, RateWithN>;
  dropoutScreens: Array<{ screen: string; count: number }>;
  dropoutReasons: Array<{ reason: DropoutReason; count: number }>;
  payIntent: Record<PayIntent, number>;
  generatedAt: string;
};
