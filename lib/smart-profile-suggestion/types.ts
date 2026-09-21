export type SmartProfileFieldKey =
  | "company_name"
  | "company_address"
  | "company_phone"
  | "company_fax"
  | "company_email"
  | "company_website"
  | "contact_name"
  | "department"
  | "job_title"
  | "logo"
  | "company_intro"
  | "personal_name"
  | "signature"
  | "personal_address"
  | "personal_phone"
  | "x_account"
  | "instagram"
  | "youtube"
  | "tiktok"
  | "channel_name"
  | "tone"
  | "brand_color"
  | "cta"
  | "sales_area"
  | "specialty"
  | "service_description"
  | "invoice_number"
  | "bank_info";

export type SmartProfileFieldGroup =
  | "company"
  | "personal"
  | "sns"
  | "creator"
  | "sales"
  | "other";

export type SuggestionReason =
  | "missing"
  | "recurring"
  | "quality_impact";

export type SmartProfileFact = {
  key: SmartProfileFieldKey;
  label: string;
  value: string;
  savedAt: string;
};

export type FieldSuggestion = {
  key: SmartProfileFieldKey;
  label: string;
  group: SmartProfileFieldGroup;
  reason: SuggestionReason;
  /** Prefilled candidate when we could extract a value (optional). */
  suggestedValue: string;
  /** Why this helps next time — factual, no fake scores. */
  benefit: string;
};

export type QualityImprovement = {
  /** 1–5 visual weight of remaining improvement opportunity (not a grade). */
  stars: 1 | 2 | 3 | 4 | 5;
  points: string[];
};

export type SmartProfileSuggestionModel = {
  shouldShow: boolean;
  quality: QualityImprovement;
  suggestions: FieldSuggestion[];
  missingLabels: string[];
};

export type AnalyzeDeliverableInput = {
  deliverableType: string;
  title: string;
  content: string;
  workRequest: string;
  now?: Date;
};
