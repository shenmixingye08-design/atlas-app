export type Timestamp = string;

export type BusinessProfileKind =
  | "company"
  | "sole_proprietor"
  | "organization"
  | "department";

export type BusinessContactKind =
  | "client"
  | "vendor"
  | "partner"
  | "internal"
  | "billing"
  | "other";

export type BusinessCaseKind =
  | "sales"
  | "proposal"
  | "contract"
  | "support"
  | "invoice"
  | "other";

export type BusinessFieldSensitivity =
  | "public"
  | "internal"
  | "restricted"
  | "secret";

export type BusinessFieldValueType =
  | "text"
  | "email"
  | "phone"
  | "url"
  | "number"
  | "date"
  | "boolean"
  | "json"
  | "bank_account";

export type BusinessFieldSourceKind =
  | "saved_profile"
  | "saved_contact"
  | "saved_project"
  | "uploaded_document"
  | "current_request"
  | "user_confirmed"
  | "ai_inferred";

export type BusinessFieldUsageFlags = {
  aiUsageAllowed: boolean;
  documentUsageAllowed: boolean;
  usageForbidden: boolean;
};

export type BuiltinBusinessProfileFieldKey =
  | "displayName"
  | "companyName"
  | "legalName"
  | "department"
  | "postalCode"
  | "addressLine1"
  | "addressLine2"
  | "phone"
  | "email"
  | "websiteUrl"
  | "invoiceRegistrationNumber"
  | "corporateNumber"
  | "bankName"
  | "bankBranchName"
  | "bankAccountType"
  | "bankAccountNumber"
  | "bankAccountHolder"
  | "notes";

export type BuiltinBusinessContactFieldKey =
  | "displayName"
  | "companyName"
  | "department"
  | "title"
  | "email"
  | "phone"
  | "address"
  | "notes";

export type BuiltinBusinessCaseFieldKey =
  | "title"
  | "clientName"
  | "description"
  | "status"
  | "startDate"
  | "endDate"
  | "budget"
  | "notes";

export type TemplateVariableScope = "profile" | "contact" | "project";

export type TemplateVariableKey =
  | `profile.${BuiltinBusinessProfileFieldKey | string}`
  | `contact.${BuiltinBusinessContactFieldKey | string}`
  | `project.${BuiltinBusinessCaseFieldKey | string}`;

export type BusinessProfileBankAccountType =
  | "ordinary"
  | "checking"
  | "savings"
  | "other";

export type BusinessProfile = {
  id: string;
  ownerUserId: string;
  kind: BusinessProfileKind;
  displayName: string;
  companyName: string;
  legalName: string | null;
  department: string | null;
  postalCode: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  phone: string | null;
  email: string | null;
  websiteUrl: string | null;
  invoiceRegistrationNumber: string | null;
  corporateNumber: string | null;
  bankName: string | null;
  bankBranchName: string | null;
  bankAccountType: BusinessProfileBankAccountType | null;
  bankAccountNumberMasked: string | null;
  bankAccountHolder: string | null;
  notes: string | null;
  isDefault: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
};

export type BusinessProfileSecretStorage = {
  bankAccountNumberEncrypted: string | null;
  bankAccountNumberLast4: string | null;
};

export type StoredBusinessProfile = BusinessProfile & BusinessProfileSecretStorage;

export type CreateBusinessProfileInput = {
  kind?: BusinessProfileKind;
  displayName?: string;
  companyName: string;
  legalName?: string | null;
  department?: string | null;
  postalCode?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  invoiceRegistrationNumber?: string | null;
  corporateNumber?: string | null;
  bankName?: string | null;
  bankBranchName?: string | null;
  bankAccountType?: BusinessProfileBankAccountType | null;
  bankAccountNumber?: string | null;
  bankAccountHolder?: string | null;
  notes?: string | null;
  isDefault?: boolean;
};

export type CreateStoredBusinessProfileInput = Omit<
  CreateBusinessProfileInput,
  "bankAccountNumber"
> &
  BusinessProfileSecretStorage;

export type UpdateBusinessProfileInput = Partial<CreateBusinessProfileInput>;

export type UpdateStoredBusinessProfileInput = Omit<
  UpdateBusinessProfileInput,
  "bankAccountNumber"
> &
  Partial<BusinessProfileSecretStorage>;

export type BusinessProfileField = {
  id: string;
  ownerUserId: string;
  profileId: string;
  key: string;
  label: string;
  value: string | null;
  valueType: BusinessFieldValueType;
  sensitivity: BusinessFieldSensitivity;
  usage: BusinessFieldUsageFlags;
  sourceKind: BusinessFieldSourceKind;
  sourceDetail: string | null;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
};

export type StoredBusinessProfileField = BusinessProfileField & {
  secretValueEncrypted: string | null;
  hasSecretValue: boolean;
};

export type CustomFieldInput = {
  key: string;
  label: string;
  value?: string | null;
  valueType?: BusinessFieldValueType;
  sensitivity?: BusinessFieldSensitivity;
  usage?: Partial<BusinessFieldUsageFlags>;
  sourceKind?: BusinessFieldSourceKind;
  sourceDetail?: string | null;
  sortOrder?: number;
};

export type StoredCustomFieldInput = Omit<CustomFieldInput, "value"> & {
  value?: string | null;
  secretValueEncrypted?: string | null;
  hasSecretValue?: boolean;
};

export type BusinessContact = {
  id: string;
  ownerUserId: string;
  profileId: string | null;
  kind: BusinessContactKind;
  displayName: string;
  companyName: string | null;
  department: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isPrimary: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
};

export type CreateBusinessContactInput = {
  profileId?: string | null;
  kind?: BusinessContactKind;
  displayName: string;
  companyName?: string | null;
  department?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isPrimary?: boolean;
};

export type UpdateBusinessContactInput = Partial<CreateBusinessContactInput>;

export type BusinessCase = {
  id: string;
  ownerUserId: string;
  profileId: string | null;
  kind: BusinessCaseKind;
  title: string;
  clientName: string | null;
  description: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  budget: string | null;
  notes: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
};

export type CreateBusinessCaseInput = {
  profileId?: string | null;
  kind?: BusinessCaseKind;
  title: string;
  clientName?: string | null;
  description?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  budget?: string | null;
  notes?: string | null;
};

export type UpdateBusinessCaseInput = Partial<CreateBusinessCaseInput>;

export type BusinessCaseContact = {
  id: string;
  ownerUserId: string;
  caseId: string;
  contactId: string;
  role: string | null;
  createdAt: Timestamp;
};

export type ArtifactDataBinding = {
  id: string;
  ownerUserId: string;
  artifactId: string;
  profileId: string | null;
  contactId: string | null;
  caseId: string | null;
  fieldKeys: string[];
  createdAt: Timestamp;
};

export type ProfileUsageLog = {
  id: string;
  ownerUserId: string;
  profileId: string | null;
  contactId: string | null;
  caseId: string | null;
  artifactId: string | null;
  purpose: string;
  fieldKeys: string[];
  createdAt: Timestamp;
};

export type ExtractedDocumentField = {
  id: string;
  ownerUserId: string;
  documentId: string;
  fieldKey: string;
  label: string;
  value: string;
  confidence: number | null;
  sourcePage: number | null;
  confirmedAt: Timestamp | null;
  createdAt: Timestamp;
};

export type ResolvedField = {
  key: TemplateVariableKey | string;
  label: string;
  value: string | null;
  valueType: BusinessFieldValueType;
  sensitivity: BusinessFieldSensitivity;
  usage: BusinessFieldUsageFlags;
  sourceKind: BusinessFieldSourceKind;
  sourceId: string | null;
  sourceLabel: string | null;
  missing: boolean;
  required: boolean;
};

export type NeedsInputState = {
  status: "ready" | "needs_input";
  missingRequired: ResolvedField[];
};

export type NeedsInputRequest = {
  status: "needs_input";
  reason: string;
  missingFields: Array<{
    key: string;
    label: string;
    sourceLabel: string | null;
  }>;
  context: {
    profileId: string | null;
    contactIds: string[];
    caseId: string | null;
  };
};

export type ArtifactContext = {
  ownerUserId: string;
  profile: BusinessProfile | null;
  contacts: BusinessContact[];
  project: BusinessCase | null;
  fields: ResolvedField[];
  usedFields: ResolvedField[];
  unusedFields: ResolvedField[];
  missingRequired: ResolvedField[];
  variables: Record<string, string | null>;
  needsInput: NeedsInputState;
};

export type ResolveArtifactContextInput = {
  ownerUserId: string;
  profileId?: string | null;
  contactId?: string | null;
  contactIds?: string[];
  caseId?: string | null;
  template?: string | null;
  requiredVariables?: string[];
  currentRequestFields?: Record<string, string | null | undefined>;
  uploadedDocumentFields?: Record<string, string | null | undefined>;
  userConfirmedFields?: Record<string, string | null | undefined>;
  aiInferredFields?: Record<string, string | null | undefined>;
};

export type SanitizedAIField = {
  key: string;
  label: string;
  value: string;
  valueType: BusinessFieldValueType;
  sourceKind: BusinessFieldSourceKind;
  sourceLabel: string | null;
};

export type SanitizedArtifactContextForAI = {
  profileId: string | null;
  contactIds: string[];
  caseId: string | null;
  fields: SanitizedAIField[];
};

export type BusinessProfileValidationError = {
  field: string;
  message: string;
};

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: BusinessProfileValidationError[] };
