export type PublishScope =
  | "GA公開"
  | "β公開"
  | "招待制"
  | "管理者のみ"
  | "一時停止"
  | "非表示"
  | "未公開";

export type FindingSeverity = "Critical" | "High" | "Medium" | "Low";

export type ReleaseFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  area: string;
  evidence: string;
  status: "open" | "fixed" | "mitigated" | "accepted_with_hide";
  blocksRelease: boolean;
};

export type PhaseEvidenceAudit = {
  phase: string;
  title: string;
  conducted: boolean;
  production: boolean;
  sampleSize: number | null;
  hasRequestIds: boolean;
  hasScreenshots: boolean;
  successRate: number | null;
  p95Ms: number | null;
  failuresSaved: boolean;
  retestAfterFix: boolean;
  claimedPass: boolean;
  honestPass: boolean;
  notes: string;
};

export type CapabilityId =
  | "word"
  | "excel"
  | "pdf"
  | "powerpoint"
  | "csv"
  | "vision"
  | "ocr"
  | "image_to_excel"
  | "image_to_word"
  | "image_to_pdf"
  | "convert"
  | "revise"
  | "revision"
  | "x_post"
  | "gmail"
  | "gcal"
  | "wordpress"
  | "dropbox"
  | "automation"
  | "push"
  | "email_notify"
  | "signup"
  | "billing"
  | "new_jobs";

export type KillSwitchId =
  | "external_all"
  | "x_post"
  | "email_send"
  | "calendar_write"
  | "wordpress_publish"
  | "dropbox_write"
  | "billing"
  | "new_jobs"
  | "large_upload"
  | "vision"
  | "automation"
  | "openai_all";

export type CapabilityPublishDecision = {
  id: CapabilityId;
  scope: PublishScope;
  reason: string;
  gaReady: boolean;
};
