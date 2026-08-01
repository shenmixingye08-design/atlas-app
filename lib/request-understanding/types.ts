export type ExecutionMode =
  | "answer"
  | "artifact"
  | "conversion"
  | "analysis"
  | "external_action"
  | "automation"
  | "mixed";

export type OutputFormat =
  | "docx"
  | "xlsx"
  | "pdf"
  | "pptx"
  | "csv"
  | "json"
  | "markdown"
  | "image"
  | "none";

export type SourceInputType =
  | "text"
  | "image"
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "csv"
  | "url"
  | "external_service";

export type RequestIntent =
  | "conversation"
  | "create_word"
  | "create_excel"
  | "create_pdf"
  | "create_pptx"
  | "create_csv"
  | "create_image"
  | "edit_artifact"
  | "convert_file"
  | "analyze_file"
  | "analyze_image"
  | "analyze_data"
  | "external_execute"
  | "schedule_automation"
  | "schedule_once"
  | "notify"
  | "composite"
  | "needs_input"
  | "unsupported";

export type TaskCategory =
  | "document"
  | "spreadsheet"
  | "presentation"
  | "data"
  | "vision"
  | "communication"
  | "automation"
  | "research"
  | "unknown";

export type DocumentKind =
  | "minutes"
  | "report"
  | "estimate"
  | "invoice"
  | "contract"
  | "proposal"
  | "sales_deck"
  | "household"
  | "attendance"
  | "resume"
  | "blog"
  | "email_draft"
  | "sns_draft"
  | "generic"
  | null;

export type FieldRequirementLevel =
  | "hard_required"
  | "editable_later"
  | "safe_assume"
  | "never_assume"
  | "optional";

export type RequiredFieldSpec = {
  key: string;
  label: string;
  level: FieldRequirementLevel;
};

export type RequestedOutput = {
  format: OutputFormat;
  purpose: string;
  required: boolean;
  confidence: number;
};

export type SourceInput = {
  type: SourceInputType;
  reference: string;
  role: string;
  mimeType?: string;
  fileName?: string;
  byteLength?: number;
  confidence?: number;
};

export type WorkflowStep = {
  stepId: string;
  type: string;
  input: string;
  output: string;
  dependency: string[];
  status: "pending" | "blocked" | "ready" | "skipped";
  retryPolicy: "transient_only" | "none";
  requiresConfirmation: boolean;
  failurePolicy: "stop_pipeline" | "continue_optional";
};

export type ConfidenceBreakdown = {
  intent: number;
  executionMode: number;
  outputFormat: number;
  attachmentRole: number;
  documentKind: number;
  requiredFields: number;
  conversionPath: number;
  externalAction: number;
};

export type ParsedRequest = {
  request_id: string;
  intent: RequestIntent;
  task_category: TaskCategory;
  document_kind: DocumentKind;
  execution_mode: ExecutionMode;
  requested_outputs: RequestedOutput[];
  source_inputs: SourceInput[];
  detected_entities: Record<string, string | number | boolean | null>;
  required_fields: RequiredFieldSpec[];
  missing_required_fields: string[];
  optional_fields: string[];
  assumptions: string[];
  risks: string[];
  needs_clarification: boolean;
  clarification_questions: string[];
  confidence: number;
  confidence_breakdown: ConfidenceBreakdown;
  recommended_workflow: WorkflowStep[];
  user_summary: string;
  router_target: RouterTarget;
  unsupported_reason?: string;
  alternatives?: string[];
  fallback_used: boolean;
  diagnostic_id: string;
};

export type RouterTarget =
  | "conversation"
  | "artifact_generate"
  | "artifact_convert"
  | "artifact_edit"
  | "file_analyze"
  | "vision_analyze"
  | "external_execute"
  | "automation_register"
  | "composite_workflow"
  | "needs_input"
  | "unsupported";

export type AttachmentMeta = {
  id?: string;
  fileName?: string;
  mimeType?: string;
  byteLength?: number;
  pageCount?: number;
  sheetCount?: number;
  slideCount?: number;
  kindHint?: SourceInputType;
};

export type UnderstandInput = {
  assignment: string;
  userId?: string | null;
  attachments?: AttachmentMeta[];
  preferredFormat?: string | null;
  /** Safe overrides from UI correction without full re-parse of intent. */
  overrides?: Partial<{
    requested_outputs: RequestedOutput[];
    execution_mode: ExecutionMode;
    skip_external: boolean;
    skip_automation: boolean;
    assumptions: string[];
  }>;
  idempotencyKey?: string | null;
  requestId?: string | null;
};

export type RouteDecision = {
  target: RouterTarget;
  parsed: ParsedRequest;
  shouldStartJob: boolean;
  shouldConfirm: boolean;
  formats: OutputFormat[];
  userMessage: string;
  developerCode: string;
};

export type RequestUserErrorCode =
  | "request_parse_failed"
  | "intent_classification_failed"
  | "ambiguous_request"
  | "unsupported_intent"
  | "attachment_missing"
  | "attachment_unsupported"
  | "required_information_missing"
  | "output_format_conflict"
  | "workflow_generation_failed"
  | "routing_failed"
  | "permission_denied"
  | "external_connection_required"
  | "confirmation_required"
  | "duplicate_request"
  | "timeout";
