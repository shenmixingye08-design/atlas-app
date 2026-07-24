import "server-only";

import { randomUUID } from "crypto";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import { DEFAULT_ALLOWED_USAGE } from "./constants";
import { maskLast4 } from "./crypto";
import { mergeUsageFlags, usageForSensitivity } from "./usage-policy";
import type {
  ArtifactDataBinding,
  BusinessCase,
  BusinessCaseContact,
  BusinessContact,
  BusinessFieldSensitivity,
  BusinessFieldSourceKind,
  BusinessFieldUsageFlags,
  BusinessFieldValueType,
  BusinessProfile,
  BusinessProfileField,
  CreateBusinessCaseInput,
  CreateBusinessContactInput,
  CreateStoredBusinessProfileInput,
  ProfileUsageLog,
  StoredBusinessProfile,
  StoredBusinessProfileField,
  StoredCustomFieldInput,
  UpdateBusinessCaseInput,
  UpdateBusinessContactInput,
  UpdateStoredBusinessProfileInput,
} from "./types";

const PROFILES_TABLE = "atlas_business_profiles";
const FIELDS_TABLE = "atlas_business_profile_fields";
const CONTACTS_TABLE = "atlas_business_contacts";
const CASES_TABLE = "atlas_business_cases";
const CASE_CONTACTS_TABLE = "atlas_business_case_contacts";
const ARTIFACT_BINDINGS_TABLE = "atlas_artifact_data_bindings";
const USAGE_LOGS_TABLE = "atlas_profile_usage_logs";

type DbError = { message?: string };
type DbResult<T> = { data: T; error: DbError | null };

type LooseQueryBuilder = {
  select: (...args: unknown[]) => LooseQueryBuilder;
  eq: (...args: unknown[]) => LooseQueryBuilder;
  is: (...args: unknown[]) => LooseQueryBuilder;
  order: (...args: unknown[]) => LooseQueryBuilder;
  limit: (...args: unknown[]) => LooseQueryBuilder;
  maybeSingle: (...args: unknown[]) => LooseQueryBuilder;
  single: (...args: unknown[]) => LooseQueryBuilder;
  insert: (...args: unknown[]) => LooseQueryBuilder;
  update: (...args: unknown[]) => LooseQueryBuilder;
  delete: (...args: unknown[]) => LooseQueryBuilder;
  upsert: (...args: unknown[]) => LooseQueryBuilder;
};

type SupabaseLike = {
  from: (table: string) => LooseQueryBuilder;
};

type ProfileRow = {
  id: string;
  owner_user_id: string;
  kind: string | null;
  display_name: string | null;
  company_name: string | null;
  legal_name: string | null;
  department: string | null;
  postal_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  invoice_registration_number: string | null;
  corporate_number: string | null;
  bank_name: string | null;
  bank_branch_name: string | null;
  bank_account_type: string | null;
  bank_account_number_encrypted: string | null;
  bank_account_number_last4: string | null;
  bank_account_holder: string | null;
  notes: string | null;
  is_default: boolean | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type FieldRow = {
  id: string;
  owner_user_id: string;
  profile_id: string;
  field_key: string;
  label: string;
  value_text: string | null;
  secret_value_encrypted: string | null;
  has_secret_value: boolean | null;
  value_type: string | null;
  sensitivity: string | null;
  ai_usage_allowed: boolean | null;
  document_usage_allowed: boolean | null;
  usage_forbidden: boolean | null;
  source_kind: string | null;
  source_detail: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ContactRow = {
  id: string;
  owner_user_id: string;
  profile_id: string | null;
  kind: string | null;
  display_name: string | null;
  company_name: string | null;
  department: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_primary: boolean | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type CaseRow = {
  id: string;
  owner_user_id: string;
  profile_id: string | null;
  kind: string | null;
  title: string | null;
  client_name: string | null;
  description: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type CaseContactRow = {
  id: string;
  owner_user_id: string;
  case_id: string;
  contact_id: string;
  role: string | null;
  created_at: string;
};

type ArtifactBindingRow = {
  id: string;
  owner_user_id: string;
  artifact_id: string;
  profile_id: string | null;
  contact_id: string | null;
  case_id: string | null;
  field_keys: string[] | null;
  created_at: string;
};

type UsageLogRow = {
  id: string;
  owner_user_id: string;
  profile_id: string | null;
  contact_id: string | null;
  case_id: string | null;
  artifact_id: string | null;
  purpose: string | null;
  field_keys: string[] | null;
  created_at: string;
};

type BusinessProfileBuckets = {
  profiles: Map<string, StoredBusinessProfile>;
  fields: Map<string, StoredBusinessProfileField>;
  contacts: Map<string, BusinessContact>;
  cases: Map<string, BusinessCase>;
  caseContacts: Map<string, BusinessCaseContact>;
  artifactBindings: Map<string, ArtifactDataBinding>;
  usageLogs: Map<string, ProfileUsageLog>;
};

function getBuckets(): BusinessProfileBuckets {
  const scope = globalThis as typeof globalThis & {
    __atlasBusinessProfileBuckets?: BusinessProfileBuckets;
  };
  if (!scope.__atlasBusinessProfileBuckets) {
    scope.__atlasBusinessProfileBuckets = {
      profiles: new Map(),
      fields: new Map(),
      contacts: new Map(),
      cases: new Map(),
      caseContacts: new Map(),
      artifactBindings: new Map(),
      usageLogs: new Map(),
    };
  }
  return scope.__atlasBusinessProfileBuckets;
}

function getClient(): SupabaseLike | null {
  return createServiceRoleClientIfConfigured() as unknown as SupabaseLike | null;
}

function warnDurable(operation: string, error: DbError | null): void {
  if (!error) return;
  console.warn(`[business-profile] ${operation} failed:`, error.message);
}

function nowIso(): string {
  return new Date().toISOString();
}

function publicProfile(profile: StoredBusinessProfile): BusinessProfile {
  return {
    id: profile.id,
    ownerUserId: profile.ownerUserId,
    kind: profile.kind,
    displayName: profile.displayName,
    companyName: profile.companyName,
    legalName: profile.legalName,
    department: profile.department,
    postalCode: profile.postalCode,
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2,
    phone: profile.phone,
    email: profile.email,
    websiteUrl: profile.websiteUrl,
    invoiceRegistrationNumber: profile.invoiceRegistrationNumber,
    corporateNumber: profile.corporateNumber,
    bankName: profile.bankName,
    bankBranchName: profile.bankBranchName,
    bankAccountType: profile.bankAccountType,
    bankAccountNumberMasked: maskLast4(profile.bankAccountNumberLast4),
    bankAccountHolder: profile.bankAccountHolder,
    notes: profile.notes,
    isDefault: profile.isDefault,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    deletedAt: profile.deletedAt,
  };
}

function mapProfileRow(row: ProfileRow): StoredBusinessProfile {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    kind: row.kind === "sole_proprietor" ||
      row.kind === "organization" ||
      row.kind === "department"
      ? row.kind
      : "company",
    displayName: row.display_name ?? row.company_name ?? "",
    companyName: row.company_name ?? "",
    legalName: row.legal_name,
    department: row.department,
    postalCode: row.postal_code,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    phone: row.phone,
    email: row.email,
    websiteUrl: row.website_url,
    invoiceRegistrationNumber: row.invoice_registration_number,
    corporateNumber: row.corporate_number,
    bankName: row.bank_name,
    bankBranchName: row.bank_branch_name,
    bankAccountType:
      row.bank_account_type === "ordinary" ||
      row.bank_account_type === "checking" ||
      row.bank_account_type === "savings" ||
      row.bank_account_type === "other"
        ? row.bank_account_type
        : null,
    bankAccountNumberEncrypted: row.bank_account_number_encrypted,
    bankAccountNumberLast4: row.bank_account_number_last4,
    bankAccountNumberMasked: maskLast4(row.bank_account_number_last4),
    bankAccountHolder: row.bank_account_holder,
    notes: row.notes,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function profileToRow(profile: StoredBusinessProfile): ProfileRow {
  return {
    id: profile.id,
    owner_user_id: profile.ownerUserId,
    kind: profile.kind,
    display_name: profile.displayName,
    company_name: profile.companyName,
    legal_name: profile.legalName,
    department: profile.department,
    postal_code: profile.postalCode,
    address_line1: profile.addressLine1,
    address_line2: profile.addressLine2,
    phone: profile.phone,
    email: profile.email,
    website_url: profile.websiteUrl,
    invoice_registration_number: profile.invoiceRegistrationNumber,
    corporate_number: profile.corporateNumber,
    bank_name: profile.bankName,
    bank_branch_name: profile.bankBranchName,
    bank_account_type: profile.bankAccountType,
    bank_account_number_encrypted: profile.bankAccountNumberEncrypted,
    bank_account_number_last4: profile.bankAccountNumberLast4,
    bank_account_holder: profile.bankAccountHolder,
    notes: profile.notes,
    is_default: profile.isDefault,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
    deleted_at: profile.deletedAt,
  };
}

function fieldUsageFromRow(row: FieldRow): BusinessFieldUsageFlags {
  return {
    aiUsageAllowed: row.ai_usage_allowed ?? true,
    documentUsageAllowed: row.document_usage_allowed ?? true,
    usageForbidden: row.usage_forbidden ?? false,
  };
}

function mapFieldRow(row: FieldRow): StoredBusinessProfileField {
  const sensitivity =
    row.sensitivity === "public" ||
    row.sensitivity === "restricted" ||
    row.sensitivity === "secret"
      ? row.sensitivity
      : "internal";
  const usage = usageForSensitivity(sensitivity, fieldUsageFromRow(row));
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    profileId: row.profile_id,
    key: row.field_key,
    label: row.label,
    value: sensitivity === "secret" ? null : row.value_text,
    secretValueEncrypted: row.secret_value_encrypted,
    hasSecretValue: Boolean(row.has_secret_value),
    valueType:
      row.value_type === "email" ||
      row.value_type === "phone" ||
      row.value_type === "url" ||
      row.value_type === "number" ||
      row.value_type === "date" ||
      row.value_type === "boolean" ||
      row.value_type === "json" ||
      row.value_type === "bank_account"
        ? row.value_type
        : "text",
    sensitivity,
    usage,
    sourceKind:
      row.source_kind === "saved_contact" ||
      row.source_kind === "saved_project" ||
      row.source_kind === "uploaded_document" ||
      row.source_kind === "current_request" ||
      row.source_kind === "user_confirmed" ||
      row.source_kind === "ai_inferred"
        ? row.source_kind
        : "saved_profile",
    sourceDetail: row.source_detail,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function fieldToRow(field: StoredBusinessProfileField): FieldRow {
  return {
    id: field.id,
    owner_user_id: field.ownerUserId,
    profile_id: field.profileId,
    field_key: field.key,
    label: field.label,
    value_text: field.value,
    secret_value_encrypted: field.secretValueEncrypted,
    has_secret_value: field.hasSecretValue,
    value_type: field.valueType,
    sensitivity: field.sensitivity,
    ai_usage_allowed: field.usage.aiUsageAllowed,
    document_usage_allowed: field.usage.documentUsageAllowed,
    usage_forbidden: field.usage.usageForbidden,
    source_kind: field.sourceKind,
    source_detail: field.sourceDetail,
    sort_order: field.sortOrder,
    created_at: field.createdAt,
    updated_at: field.updatedAt,
    deleted_at: field.deletedAt,
  };
}

function publicField(field: StoredBusinessProfileField): BusinessProfileField {
  return {
    id: field.id,
    ownerUserId: field.ownerUserId,
    profileId: field.profileId,
    key: field.key,
    label: field.label,
    value: field.value,
    valueType: field.valueType,
    sensitivity: field.sensitivity,
    usage: field.usage,
    sourceKind: field.sourceKind,
    sourceDetail: field.sourceDetail,
    sortOrder: field.sortOrder,
    createdAt: field.createdAt,
    updatedAt: field.updatedAt,
    deletedAt: field.deletedAt,
  };
}

function mapContactRow(row: ContactRow): BusinessContact {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    profileId: row.profile_id,
    kind:
      row.kind === "client" ||
      row.kind === "vendor" ||
      row.kind === "partner" ||
      row.kind === "internal" ||
      row.kind === "billing"
        ? row.kind
        : "other",
    displayName: row.display_name ?? "",
    companyName: row.company_name,
    department: row.department,
    title: row.title,
    email: row.email,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function contactToRow(contact: BusinessContact): ContactRow {
  return {
    id: contact.id,
    owner_user_id: contact.ownerUserId,
    profile_id: contact.profileId,
    kind: contact.kind,
    display_name: contact.displayName,
    company_name: contact.companyName,
    department: contact.department,
    title: contact.title,
    email: contact.email,
    phone: contact.phone,
    address: contact.address,
    notes: contact.notes,
    is_primary: contact.isPrimary,
    created_at: contact.createdAt,
    updated_at: contact.updatedAt,
    deleted_at: contact.deletedAt,
  };
}

function mapCaseRow(row: CaseRow): BusinessCase {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    profileId: row.profile_id,
    kind:
      row.kind === "sales" ||
      row.kind === "proposal" ||
      row.kind === "contract" ||
      row.kind === "support" ||
      row.kind === "invoice"
        ? row.kind
        : "other",
    title: row.title ?? "",
    clientName: row.client_name,
    description: row.description,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    budget: row.budget,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function caseToRow(item: BusinessCase): CaseRow {
  return {
    id: item.id,
    owner_user_id: item.ownerUserId,
    profile_id: item.profileId,
    kind: item.kind,
    title: item.title,
    client_name: item.clientName,
    description: item.description,
    status: item.status,
    start_date: item.startDate,
    end_date: item.endDate,
    budget: item.budget,
    notes: item.notes,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    deleted_at: item.deletedAt,
  };
}

function profileFromInput(
  ownerUserId: string,
  input: CreateStoredBusinessProfileInput,
  isDefault: boolean,
): StoredBusinessProfile {
  const now = nowIso();
  return {
    id: randomUUID(),
    ownerUserId,
    kind: input.kind ?? "company",
    displayName: input.displayName ?? input.companyName,
    companyName: input.companyName,
    legalName: input.legalName ?? null,
    department: input.department ?? null,
    postalCode: input.postalCode ?? null,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    websiteUrl: input.websiteUrl ?? null,
    invoiceRegistrationNumber: input.invoiceRegistrationNumber ?? null,
    corporateNumber: input.corporateNumber ?? null,
    bankName: input.bankName ?? null,
    bankBranchName: input.bankBranchName ?? null,
    bankAccountType: input.bankAccountType ?? null,
    bankAccountNumberEncrypted: input.bankAccountNumberEncrypted,
    bankAccountNumberLast4: input.bankAccountNumberLast4,
    bankAccountNumberMasked: maskLast4(input.bankAccountNumberLast4),
    bankAccountHolder: input.bankAccountHolder ?? null,
    notes: input.notes ?? null,
    isDefault,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function activeProfilesForUser(ownerUserId: string): StoredBusinessProfile[] {
  return [...getBuckets().profiles.values()].filter(
    (profile) => profile.ownerUserId === ownerUserId && !profile.deletedAt,
  );
}

function sortProfiles(items: StoredBusinessProfile[]): StoredBusinessProfile[] {
  return [...items].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export class BusinessProfileRepository {
  async listProfiles(ownerUserId: string): Promise<BusinessProfile[]> {
    const client = getClient();
    if (!client) {
      return sortProfiles(activeProfilesForUser(ownerUserId)).map(publicProfile);
    }

    const result = await (client
      .from(PROFILES_TABLE)
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false }) as unknown as Promise<
      DbResult<ProfileRow[]>
    >);
    warnDurable("list profiles", result.error);
    return result.error ? [] : result.data.map(mapProfileRow).map(publicProfile);
  }

  async getProfileForUser(
    ownerUserId: string,
    profileId: string,
  ): Promise<BusinessProfile | null> {
    const stored = await this.getStoredProfileForUser(ownerUserId, profileId);
    return stored ? publicProfile(stored) : null;
  }

  async getStoredProfileForUser(
    ownerUserId: string,
    profileId: string,
  ): Promise<StoredBusinessProfile | null> {
    const client = getClient();
    if (!client) {
      const profile = getBuckets().profiles.get(profileId);
      return profile && profile.ownerUserId === ownerUserId && !profile.deletedAt
        ? profile
        : null;
    }

    const result = await (client
      .from(PROFILES_TABLE)
      .select("*")
      .eq("id", profileId)
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null)
      .maybeSingle() as unknown as Promise<DbResult<ProfileRow | null>>);
    warnDurable("get profile", result.error);
    return result.error || !result.data ? null : mapProfileRow(result.data);
  }

  async getDefaultProfileForUser(
    ownerUserId: string,
  ): Promise<BusinessProfile | null> {
    const client = getClient();
    if (!client) {
      const profile = activeProfilesForUser(ownerUserId).find((item) => item.isDefault);
      return profile ? publicProfile(profile) : null;
    }

    const result = await (client
      .from(PROFILES_TABLE)
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .eq("is_default", true)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle() as unknown as Promise<DbResult<ProfileRow | null>>);
    warnDurable("get default profile", result.error);
    return result.error || !result.data ? null : publicProfile(mapProfileRow(result.data));
  }

  async createProfile(
    ownerUserId: string,
    input: CreateStoredBusinessProfileInput,
  ): Promise<BusinessProfile> {
    const existing = await this.listProfiles(ownerUserId);
    const shouldDefault = input.isDefault === true || existing.length === 0;
    const profile = profileFromInput(ownerUserId, input, shouldDefault);

    const client = getClient();
    if (!client) {
      if (shouldDefault) {
        for (const item of activeProfilesForUser(ownerUserId)) {
          item.isDefault = false;
          item.updatedAt = nowIso();
        }
      }
      getBuckets().profiles.set(profile.id, profile);
      return publicProfile(profile);
    }

    if (shouldDefault) {
      await (client
        .from(PROFILES_TABLE)
        .update({ is_default: false, updated_at: nowIso() })
        .eq("owner_user_id", ownerUserId)
        .is("deleted_at", null) as unknown as Promise<DbResult<ProfileRow[]>>);
    }

    const result = await (client
      .from(PROFILES_TABLE)
      .insert(profileToRow(profile))
      .select("*")
      .single() as unknown as Promise<DbResult<ProfileRow>>);
    warnDurable("create profile", result.error);
    return publicProfile(result.error ? profile : mapProfileRow(result.data));
  }

  async updateProfile(
    ownerUserId: string,
    profileId: string,
    patch: UpdateStoredBusinessProfileInput,
  ): Promise<BusinessProfile | null> {
    const existing = await this.getStoredProfileForUser(ownerUserId, profileId);
    if (!existing) return null;

    const updated: StoredBusinessProfile = {
      ...existing,
      ...patch,
      displayName: patch.displayName ?? existing.displayName,
      updatedAt: nowIso(),
    };

    if (patch.bankAccountNumberEncrypted !== undefined) {
      updated.bankAccountNumberEncrypted = patch.bankAccountNumberEncrypted;
      updated.bankAccountNumberLast4 = patch.bankAccountNumberLast4 ?? null;
      updated.bankAccountNumberMasked = maskLast4(updated.bankAccountNumberLast4);
    }

    const client = getClient();
    if (!client) {
      getBuckets().profiles.set(profileId, updated);
      if (patch.isDefault === true) await this.setDefaultProfile(ownerUserId, profileId);
      return publicProfile(getBuckets().profiles.get(profileId) ?? updated);
    }

    const result = await (client
      .from(PROFILES_TABLE)
      .update(profileToRow(updated))
      .eq("id", profileId)
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null)
      .select("*")
      .single() as unknown as Promise<DbResult<ProfileRow>>);
    warnDurable("update profile", result.error);
    if (result.error) return null;
    if (patch.isDefault === true) return this.setDefaultProfile(ownerUserId, profileId);
    return publicProfile(mapProfileRow(result.data));
  }

  async softDeleteProfile(ownerUserId: string, profileId: string): Promise<boolean> {
    const existing = await this.getStoredProfileForUser(ownerUserId, profileId);
    if (!existing) return false;
    const patch = { deleted_at: nowIso(), is_default: false, updated_at: nowIso() };

    const client = getClient();
    if (!client) {
      getBuckets().profiles.set(profileId, {
        ...existing,
        deletedAt: patch.deleted_at,
        isDefault: false,
        updatedAt: patch.updated_at,
      });
      return true;
    }

    const result = await (client
      .from(PROFILES_TABLE)
      .update(patch)
      .eq("id", profileId)
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null) as unknown as Promise<DbResult<ProfileRow[]>>);
    warnDurable("delete profile", result.error);
    return !result.error;
  }

  async setDefaultProfile(
    ownerUserId: string,
    profileId: string,
  ): Promise<BusinessProfile | null> {
    const existing = await this.getStoredProfileForUser(ownerUserId, profileId);
    if (!existing) return null;
    const updatedAt = nowIso();

    const client = getClient();
    if (!client) {
      for (const item of activeProfilesForUser(ownerUserId)) {
        item.isDefault = item.id === profileId;
        item.updatedAt = updatedAt;
      }
      return publicProfile(getBuckets().profiles.get(profileId)!);
    }

    await (client
      .from(PROFILES_TABLE)
      .update({ is_default: false, updated_at: updatedAt })
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null) as unknown as Promise<DbResult<ProfileRow[]>>);

    const result = await (client
      .from(PROFILES_TABLE)
      .update({ is_default: true, updated_at: updatedAt })
      .eq("id", profileId)
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null)
      .select("*")
      .single() as unknown as Promise<DbResult<ProfileRow>>);
    warnDurable("set default profile", result.error);
    return result.error ? null : publicProfile(mapProfileRow(result.data));
  }

  async listFields(
    ownerUserId: string,
    profileId: string,
  ): Promise<BusinessProfileField[]> {
    const client = getClient();
    if (!client) {
      return [...getBuckets().fields.values()]
        .filter(
          (field) =>
            field.ownerUserId === ownerUserId &&
            field.profileId === profileId &&
            !field.deletedAt,
        )
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
        .map(publicField);
    }

    const result = await (client
      .from(FIELDS_TABLE)
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .eq("profile_id", profileId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }) as unknown as Promise<
      DbResult<FieldRow[]>
    >);
    warnDurable("list fields", result.error);
    return result.error ? [] : result.data.map(mapFieldRow).map(publicField);
  }

  async upsertField(
    ownerUserId: string,
    profileId: string,
    input: StoredCustomFieldInput,
  ): Promise<BusinessProfileField | null> {
    const profile = await this.getStoredProfileForUser(ownerUserId, profileId);
    if (!profile) return null;

    const existing = [...getBuckets().fields.values()].find(
      (field) =>
        field.ownerUserId === ownerUserId &&
        field.profileId === profileId &&
        field.key === input.key,
    );
    const sensitivity = input.sensitivity ?? existing?.sensitivity ?? "internal";
    const usage = usageForSensitivity(
      sensitivity,
      mergeUsageFlags(existing?.usage ?? DEFAULT_ALLOWED_USAGE, input.usage),
    );
    const now = nowIso();
    const field: StoredBusinessProfileField = {
      id: existing?.id ?? randomUUID(),
      ownerUserId,
      profileId,
      key: input.key,
      label: input.label,
      value: sensitivity === "secret" ? null : input.value ?? null,
      secretValueEncrypted:
        input.secretValueEncrypted ?? existing?.secretValueEncrypted ?? null,
      hasSecretValue: input.hasSecretValue ?? existing?.hasSecretValue ?? false,
      valueType: input.valueType ?? existing?.valueType ?? "text",
      sensitivity,
      usage,
      sourceKind: input.sourceKind ?? existing?.sourceKind ?? "user_confirmed",
      sourceDetail: input.sourceDetail ?? existing?.sourceDetail ?? null,
      sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };

    const client = getClient();
    if (!client) {
      getBuckets().fields.set(field.id, field);
      return publicField(field);
    }

    const result = await (client
      .from(FIELDS_TABLE)
      .upsert(fieldToRow(field), {
        onConflict: "owner_user_id,profile_id,field_key",
      })
      .select("*")
      .single() as unknown as Promise<DbResult<FieldRow>>);
    warnDurable("upsert field", result.error);
    return result.error ? null : publicField(mapFieldRow(result.data));
  }

  async deleteField(
    ownerUserId: string,
    profileId: string,
    fieldKey: string,
  ): Promise<boolean> {
    const client = getClient();
    const deletedAt = nowIso();
    if (!client) {
      const field = [...getBuckets().fields.values()].find(
        (item) =>
          item.ownerUserId === ownerUserId &&
          item.profileId === profileId &&
          item.key === fieldKey &&
          !item.deletedAt,
      );
      if (!field) return false;
      field.deletedAt = deletedAt;
      field.updatedAt = deletedAt;
      return true;
    }

    const result = await (client
      .from(FIELDS_TABLE)
      .update({ deleted_at: deletedAt, updated_at: deletedAt })
      .eq("owner_user_id", ownerUserId)
      .eq("profile_id", profileId)
      .eq("field_key", fieldKey)
      .is("deleted_at", null) as unknown as Promise<DbResult<FieldRow[]>>);
    warnDurable("delete field", result.error);
    return !result.error;
  }

  async listContacts(
    ownerUserId: string,
    filter?: { profileId?: string | null },
  ): Promise<BusinessContact[]> {
    const client = getClient();
    if (!client) {
      return [...getBuckets().contacts.values()]
        .filter(
          (contact) =>
            contact.ownerUserId === ownerUserId &&
            !contact.deletedAt &&
            (filter?.profileId === undefined || contact.profileId === filter.profileId),
        )
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    let query = client
      .from(CONTACTS_TABLE)
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null);
    if (filter?.profileId !== undefined) {
      query =
        filter.profileId === null
          ? query.is("profile_id", null)
          : query.eq("profile_id", filter.profileId);
    }
    const result = await (query.order("updated_at", {
      ascending: false,
    }) as unknown as Promise<DbResult<ContactRow[]>>);
    warnDurable("list contacts", result.error);
    return result.error ? [] : result.data.map(mapContactRow);
  }

  async getContactForUser(
    ownerUserId: string,
    contactId: string,
  ): Promise<BusinessContact | null> {
    const client = getClient();
    if (!client) {
      const contact = getBuckets().contacts.get(contactId);
      return contact && contact.ownerUserId === ownerUserId && !contact.deletedAt
        ? contact
        : null;
    }

    const result = await (client
      .from(CONTACTS_TABLE)
      .select("*")
      .eq("id", contactId)
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null)
      .maybeSingle() as unknown as Promise<DbResult<ContactRow | null>>);
    warnDurable("get contact", result.error);
    return result.error || !result.data ? null : mapContactRow(result.data);
  }

  async createContact(
    ownerUserId: string,
    input: CreateBusinessContactInput,
  ): Promise<BusinessContact | null> {
    if (input.profileId) {
      const profile = await this.getStoredProfileForUser(ownerUserId, input.profileId);
      if (!profile) return null;
    }
    const now = nowIso();
    const contact: BusinessContact = {
      id: randomUUID(),
      ownerUserId,
      profileId: input.profileId ?? null,
      kind: input.kind ?? "other",
      displayName: input.displayName,
      companyName: input.companyName ?? null,
      department: input.department ?? null,
      title: input.title ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      isPrimary: input.isPrimary ?? false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const client = getClient();
    if (!client) {
      getBuckets().contacts.set(contact.id, contact);
      return contact;
    }

    const result = await (client
      .from(CONTACTS_TABLE)
      .insert(contactToRow(contact))
      .select("*")
      .single() as unknown as Promise<DbResult<ContactRow>>);
    warnDurable("create contact", result.error);
    return result.error ? null : mapContactRow(result.data);
  }

  async updateContact(
    ownerUserId: string,
    contactId: string,
    patch: UpdateBusinessContactInput,
  ): Promise<BusinessContact | null> {
    const existing = await this.getContactForUser(ownerUserId, contactId);
    if (!existing) return null;
    if (patch.profileId) {
      const profile = await this.getStoredProfileForUser(ownerUserId, patch.profileId);
      if (!profile) return null;
    }
    const updated: BusinessContact = {
      ...existing,
      ...patch,
      updatedAt: nowIso(),
    };

    const client = getClient();
    if (!client) {
      getBuckets().contacts.set(contactId, updated);
      return updated;
    }

    const result = await (client
      .from(CONTACTS_TABLE)
      .update(contactToRow(updated))
      .eq("id", contactId)
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null)
      .select("*")
      .single() as unknown as Promise<DbResult<ContactRow>>);
    warnDurable("update contact", result.error);
    return result.error ? null : mapContactRow(result.data);
  }

  async softDeleteContact(ownerUserId: string, contactId: string): Promise<boolean> {
    const existing = await this.getContactForUser(ownerUserId, contactId);
    if (!existing) return false;
    const deletedAt = nowIso();
    const client = getClient();
    if (!client) {
      getBuckets().contacts.set(contactId, {
        ...existing,
        deletedAt,
        updatedAt: deletedAt,
      });
      return true;
    }
    const result = await (client
      .from(CONTACTS_TABLE)
      .update({ deleted_at: deletedAt, updated_at: deletedAt })
      .eq("id", contactId)
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null) as unknown as Promise<DbResult<ContactRow[]>>);
    warnDurable("delete contact", result.error);
    return !result.error;
  }

  async listCases(
    ownerUserId: string,
    filter?: { profileId?: string | null },
  ): Promise<BusinessCase[]> {
    const client = getClient();
    if (!client) {
      return [...getBuckets().cases.values()]
        .filter(
          (item) =>
            item.ownerUserId === ownerUserId &&
            !item.deletedAt &&
            (filter?.profileId === undefined || item.profileId === filter.profileId),
        )
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    let query = client
      .from(CASES_TABLE)
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null);
    if (filter?.profileId !== undefined) {
      query =
        filter.profileId === null
          ? query.is("profile_id", null)
          : query.eq("profile_id", filter.profileId);
    }
    const result = await (query.order("updated_at", {
      ascending: false,
    }) as unknown as Promise<DbResult<CaseRow[]>>);
    warnDurable("list cases", result.error);
    return result.error ? [] : result.data.map(mapCaseRow);
  }

  async getCaseForUser(
    ownerUserId: string,
    caseId: string,
  ): Promise<BusinessCase | null> {
    const client = getClient();
    if (!client) {
      const item = getBuckets().cases.get(caseId);
      return item && item.ownerUserId === ownerUserId && !item.deletedAt ? item : null;
    }
    const result = await (client
      .from(CASES_TABLE)
      .select("*")
      .eq("id", caseId)
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null)
      .maybeSingle() as unknown as Promise<DbResult<CaseRow | null>>);
    warnDurable("get case", result.error);
    return result.error || !result.data ? null : mapCaseRow(result.data);
  }

  async createCase(
    ownerUserId: string,
    input: CreateBusinessCaseInput,
  ): Promise<BusinessCase | null> {
    if (input.profileId) {
      const profile = await this.getStoredProfileForUser(ownerUserId, input.profileId);
      if (!profile) return null;
    }
    const now = nowIso();
    const item: BusinessCase = {
      id: randomUUID(),
      ownerUserId,
      profileId: input.profileId ?? null,
      kind: input.kind ?? "other",
      title: input.title,
      clientName: input.clientName ?? null,
      description: input.description ?? null,
      status: input.status ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      budget: input.budget ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const client = getClient();
    if (!client) {
      getBuckets().cases.set(item.id, item);
      return item;
    }
    const result = await (client
      .from(CASES_TABLE)
      .insert(caseToRow(item))
      .select("*")
      .single() as unknown as Promise<DbResult<CaseRow>>);
    warnDurable("create case", result.error);
    return result.error ? null : mapCaseRow(result.data);
  }

  async updateCase(
    ownerUserId: string,
    caseId: string,
    patch: UpdateBusinessCaseInput,
  ): Promise<BusinessCase | null> {
    const existing = await this.getCaseForUser(ownerUserId, caseId);
    if (!existing) return null;
    if (patch.profileId) {
      const profile = await this.getStoredProfileForUser(ownerUserId, patch.profileId);
      if (!profile) return null;
    }
    const updated: BusinessCase = { ...existing, ...patch, updatedAt: nowIso() };
    const client = getClient();
    if (!client) {
      getBuckets().cases.set(caseId, updated);
      return updated;
    }
    const result = await (client
      .from(CASES_TABLE)
      .update(caseToRow(updated))
      .eq("id", caseId)
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null)
      .select("*")
      .single() as unknown as Promise<DbResult<CaseRow>>);
    warnDurable("update case", result.error);
    return result.error ? null : mapCaseRow(result.data);
  }

  async softDeleteCase(ownerUserId: string, caseId: string): Promise<boolean> {
    const existing = await this.getCaseForUser(ownerUserId, caseId);
    if (!existing) return false;
    const deletedAt = nowIso();
    const client = getClient();
    if (!client) {
      getBuckets().cases.set(caseId, {
        ...existing,
        deletedAt,
        updatedAt: deletedAt,
      });
      return true;
    }
    const result = await (client
      .from(CASES_TABLE)
      .update({ deleted_at: deletedAt, updated_at: deletedAt })
      .eq("id", caseId)
      .eq("owner_user_id", ownerUserId)
      .is("deleted_at", null) as unknown as Promise<DbResult<CaseRow[]>>);
    warnDurable("delete case", result.error);
    return !result.error;
  }

  async linkCaseContact(input: {
    ownerUserId: string;
    caseId: string;
    contactId: string;
    role?: string | null;
  }): Promise<BusinessCaseContact | null> {
    const [item, contact] = await Promise.all([
      this.getCaseForUser(input.ownerUserId, input.caseId),
      this.getContactForUser(input.ownerUserId, input.contactId),
    ]);
    if (!item || !contact) return null;
    const row: BusinessCaseContact = {
      id: randomUUID(),
      ownerUserId: input.ownerUserId,
      caseId: input.caseId,
      contactId: input.contactId,
      role: input.role ?? null,
      createdAt: nowIso(),
    };
    const client = getClient();
    if (!client) {
      getBuckets().caseContacts.set(row.id, row);
      return row;
    }
    const dbRow: CaseContactRow = {
      id: row.id,
      owner_user_id: row.ownerUserId,
      case_id: row.caseId,
      contact_id: row.contactId,
      role: row.role,
      created_at: row.createdAt,
    };
    const result = await (client
      .from(CASE_CONTACTS_TABLE)
      .insert(dbRow)
      .select("*")
      .single() as unknown as Promise<DbResult<CaseContactRow>>);
    warnDurable("link case contact", result.error);
    return result.error
      ? null
      : {
          id: result.data.id,
          ownerUserId: result.data.owner_user_id,
          caseId: result.data.case_id,
          contactId: result.data.contact_id,
          role: result.data.role,
          createdAt: result.data.created_at,
        };
  }

  async countProfileReferences(
    ownerUserId: string,
    profileId: string,
  ): Promise<number> {
    const contacts = await this.listContacts(ownerUserId, { profileId });
    const cases = await this.listCases(ownerUserId, { profileId });
    const memoryBindings = [...getBuckets().artifactBindings.values()].filter(
      (binding) =>
        binding.ownerUserId === ownerUserId && binding.profileId === profileId,
    );
    if (!getClient()) return contacts.length + cases.length + memoryBindings.length;

    const client = getClient();
    if (!client) return contacts.length + cases.length + memoryBindings.length;
    const result = await (client
      .from(ARTIFACT_BINDINGS_TABLE)
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .eq("profile_id", profileId) as unknown as Promise<
      DbResult<ArtifactBindingRow[]>
    >);
    warnDurable("count artifact bindings", result.error);
    return (
      contacts.length +
      cases.length +
      (result.error ? 0 : result.data.length)
    );
  }

  async createArtifactDataBinding(input: {
    ownerUserId: string;
    artifactId: string;
    profileId?: string | null;
    contactId?: string | null;
    caseId?: string | null;
    fieldKeys: string[];
  }): Promise<ArtifactDataBinding> {
    const binding: ArtifactDataBinding = {
      id: randomUUID(),
      ownerUserId: input.ownerUserId,
      artifactId: input.artifactId,
      profileId: input.profileId ?? null,
      contactId: input.contactId ?? null,
      caseId: input.caseId ?? null,
      fieldKeys: [...new Set(input.fieldKeys)].sort(),
      createdAt: nowIso(),
    };
    const client = getClient();
    if (!client) {
      getBuckets().artifactBindings.set(binding.id, binding);
      return binding;
    }
    const row: ArtifactBindingRow = {
      id: binding.id,
      owner_user_id: binding.ownerUserId,
      artifact_id: binding.artifactId,
      profile_id: binding.profileId,
      contact_id: binding.contactId,
      case_id: binding.caseId,
      field_keys: binding.fieldKeys,
      created_at: binding.createdAt,
    };
    const result = await (client
      .from(ARTIFACT_BINDINGS_TABLE)
      .insert(row)
      .select("*")
      .single() as unknown as Promise<DbResult<ArtifactBindingRow>>);
    warnDurable("create artifact binding", result.error);
    if (result.error) {
      getBuckets().artifactBindings.set(binding.id, binding);
    }
    return binding;
  }

  async recordUsageLog(input: {
    ownerUserId: string;
    profileId?: string | null;
    contactId?: string | null;
    caseId?: string | null;
    artifactId?: string | null;
    purpose: string;
    fieldKeys: string[];
  }): Promise<ProfileUsageLog> {
    const uniqueKeys = [...new Set(input.fieldKeys)].sort();
    const log: ProfileUsageLog = {
      id: randomUUID(),
      ownerUserId: input.ownerUserId,
      profileId: input.profileId ?? null,
      contactId: input.contactId ?? null,
      caseId: input.caseId ?? null,
      artifactId: input.artifactId ?? null,
      purpose: input.purpose,
      fieldKeys: uniqueKeys,
      createdAt: nowIso(),
    };
    const client = getClient();
    if (!client) {
      getBuckets().usageLogs.set(log.id, log);
      return log;
    }
    const row: UsageLogRow = {
      id: log.id,
      owner_user_id: log.ownerUserId,
      profile_id: log.profileId,
      contact_id: log.contactId,
      case_id: log.caseId,
      artifact_id: log.artifactId,
      purpose: log.purpose,
      field_keys: log.fieldKeys,
      created_at: log.createdAt,
    };
    const result = await (client
      .from(USAGE_LOGS_TABLE)
      .insert(row)
      .select("*")
      .single() as unknown as Promise<DbResult<UsageLogRow>>);
    warnDurable("record usage log", result.error);
    return log;
  }

  async listUsageLogs(ownerUserId: string): Promise<ProfileUsageLog[]> {
    const client = getClient();
    if (!client) {
      return [...getBuckets().usageLogs.values()].filter(
        (log) => log.ownerUserId === ownerUserId,
      );
    }
    const result = await (client
      .from(USAGE_LOGS_TABLE)
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .order("created_at", { ascending: false }) as unknown as Promise<
      DbResult<UsageLogRow[]>
    >);
    warnDurable("list usage logs", result.error);
    return result.error
      ? []
      : result.data.map((row) => ({
          id: row.id,
          ownerUserId: row.owner_user_id,
          profileId: row.profile_id,
          contactId: row.contact_id,
          caseId: row.case_id,
          artifactId: row.artifact_id,
          purpose: row.purpose ?? "",
          fieldKeys: row.field_keys ?? [],
          createdAt: row.created_at,
        }));
  }

  async purgeUserBusinessData(ownerUserId: string): Promise<{
    profiles: number;
    fields: number;
    contacts: number;
    cases: number;
    caseContacts: number;
    artifactBindings: number;
    usageLogs: number;
  }> {
    const buckets = getBuckets();
    const counts = {
      profiles: 0,
      fields: 0,
      contacts: 0,
      cases: 0,
      caseContacts: 0,
      artifactBindings: 0,
      usageLogs: 0,
    };

    for (const [id, profile] of buckets.profiles) {
      if (profile.ownerUserId === ownerUserId) {
        buckets.profiles.delete(id);
        counts.profiles += 1;
      }
    }
    for (const [id, field] of buckets.fields) {
      if (field.ownerUserId === ownerUserId) {
        buckets.fields.delete(id);
        counts.fields += 1;
      }
    }
    for (const [id, contact] of buckets.contacts) {
      if (contact.ownerUserId === ownerUserId) {
        buckets.contacts.delete(id);
        counts.contacts += 1;
      }
    }
    for (const [id, item] of buckets.cases) {
      if (item.ownerUserId === ownerUserId) {
        buckets.cases.delete(id);
        counts.cases += 1;
      }
    }
    for (const [id, link] of buckets.caseContacts) {
      if (link.ownerUserId === ownerUserId) {
        buckets.caseContacts.delete(id);
        counts.caseContacts += 1;
      }
    }
    for (const [id, binding] of buckets.artifactBindings) {
      if (binding.ownerUserId === ownerUserId) {
        buckets.artifactBindings.delete(id);
        counts.artifactBindings += 1;
      }
    }
    for (const [id, log] of buckets.usageLogs) {
      if (log.ownerUserId === ownerUserId) {
        buckets.usageLogs.delete(id);
        counts.usageLogs += 1;
      }
    }

    const client = getClient();
    if (!client) return counts;

    const deletes: Array<[string, keyof typeof counts]> = [
      [CASE_CONTACTS_TABLE, "caseContacts"],
      [ARTIFACT_BINDINGS_TABLE, "artifactBindings"],
      [USAGE_LOGS_TABLE, "usageLogs"],
      [FIELDS_TABLE, "fields"],
      [CONTACTS_TABLE, "contacts"],
      [CASES_TABLE, "cases"],
      [PROFILES_TABLE, "profiles"],
    ];

    for (const [table, key] of deletes) {
      const result = await (client
        .from(table)
        .delete()
        .eq("owner_user_id", ownerUserId) as unknown as Promise<DbResult<unknown[]>>);
      warnDurable(`purge ${table}`, result.error);
      if (!result.error) continue;
      counts[key] = 0;
    }

    return counts;
  }
}

export function resetBusinessProfileRepositoryForTests(): void {
  const buckets = getBuckets();
  buckets.profiles.clear();
  buckets.fields.clear();
  buckets.contacts.clear();
  buckets.cases.clear();
  buckets.caseContacts.clear();
  buckets.artifactBindings.clear();
  buckets.usageLogs.clear();
}

export const businessProfileRepository = new BusinessProfileRepository();

export type {
  BusinessFieldSensitivity,
  BusinessFieldSourceKind,
  BusinessFieldValueType,
};
