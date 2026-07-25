export type DeliveryStatus =
  | "processing"
  | "reviewing"
  | "revising"
  | "completed"
  | "needs_review"
  | "waiting_for_user"
  | "failed";

export type QualityArtifactKind =
  | "x_post"
  | "sns_post"
  | "email"
  | "blog"
  | "sales_doc"
  | "pdf"
  | "word"
  | "excel"
  | "powerpoint"
  | "image"
  | "video_script"
  | "legal"
  | "report"
  | "general_text";

export type MajorErrorCode =
  | "instruction_ignored"
  | "factual_risk"
  | "format_violation"
  | "secret_leak"
  | "empty_deliverable"
  | "file_corrupt"
  | "excel_formula_error"
  | "pptx_overflow"
  | "pdf_mojibake"
  | "false_post_success"
  | "incomplete_counted"
  | "legal_missing"
  | "forbidden_content";

export type QualityIssue = {
  code: string;
  message: string;
  location?: string;
  major: boolean;
  majorCode?: MajorErrorCode;
};

export type QualityEvaluation = {
  kind: QualityArtifactKind;
  overallScore: number;
  passed: boolean;
  band: "ready" | "auto_revise" | "must_revise" | "replan";
  issues: QualityIssue[];
  majorErrors: MajorErrorCode[];
  revisionBrief: string;
  deliveryStatus: DeliveryStatus;
};

export type QualityAssuranceAudit = {
  modelUsed?: string;
  generationCount: number;
  evaluationCount: number;
  revisionCount: number;
  overallScore: number | null;
  majorErrors: MajorErrorCode[];
  usedMemoryIds: string[];
  savedMemoryIds: string[];
  durationMs?: number;
};
