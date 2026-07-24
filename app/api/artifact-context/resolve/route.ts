import {
  resolveArtifactContext,
  sanitizeContextForAI,
} from "@/lib/business-profile";
import { maskLast4, extractLast4 } from "@/lib/business-profile/crypto";
import type { ResolvedField } from "@/lib/business-profile/types";

import {
  asOptionalString,
  asStringArray,
  asStringRecord,
  isRecord,
  readJsonBody,
  requireUserId,
  unknownErrorResponse,
} from "../../business-profile-utils";

function isBankAccountNumberField(field: ResolvedField): boolean {
  return (
    field.valueType === "bank_account" ||
    /(?:bankAccountNumber|account_number|accountNumber)/.test(field.key)
  );
}

function documentFieldValue(field: ResolvedField): string | null {
  if (!field.value) return null;
  if (!isBankAccountNumberField(field)) return field.value;
  return maskLast4(extractLast4(field.value));
}

function toDocumentField(field: ResolvedField) {
  return {
    key: field.key,
    label: field.label,
    value: documentFieldValue(field),
    valueType: field.valueType,
    sensitivity: field.sensitivity,
    sourceKind: field.sourceKind,
    sourceLabel: field.sourceLabel,
    missing: field.missing,
    required: field.required,
  };
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  if (!isRecord(json.body)) {
    return Response.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const body = json.body;
  try {
    const context = await resolveArtifactContext({
      ownerUserId: auth.userId,
      profileId: asOptionalString(body.profileId),
      contactId: asOptionalString(body.contactId),
      contactIds: asStringArray(body.contactIds),
      caseId: asOptionalString(body.caseId),
      template: asOptionalString(body.template),
      requiredVariables: asStringArray(body.requiredFields),
      currentRequestFields:
        asStringRecord(body.oneTimeFields) ??
        asStringRecord(body.currentRequestFields),
      uploadedDocumentFields: asStringRecord(body.uploadedDocumentFields),
      userConfirmedFields: asStringRecord(body.userConfirmedFields),
      aiInferredFields: asStringRecord(body.aiInferredFields),
    });

    const documentFields = context.fields
      .filter((field) => field.usage.documentUsageAllowed && !field.usage.usageForbidden)
      .map(toDocumentField);

    return Response.json({
      status: context.needsInput.status,
      context: {
        profile: context.profile,
        contacts: context.contacts,
        case: context.project,
        documentFields,
        missingRequired: context.missingRequired.map(toDocumentField),
      },
      aiPreview: sanitizeContextForAI(context),
    });
  } catch (error) {
    return unknownErrorResponse(error, "/api/artifact-context/resolve");
  }
}
